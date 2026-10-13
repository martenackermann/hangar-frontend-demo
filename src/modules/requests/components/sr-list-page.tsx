import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Ban,
  CalendarCheck,
  Crown,
  Download,
  Inbox,
  Mail,
  Pause,
  PauseCircle,
  Play,
  SearchX,
  Unlock,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { BulkAction, BulkActionBar } from '@/components/data-table/bulk-action-bar'
import { ColumnChooser } from '@/components/data-table/column-chooser'
import { DataTable } from '@/components/data-table/data-table'
import {
  DensityToggle,
  FilterBar,
  type FilterDef,
  type SearchPatch,
} from '@/components/data-table/filter-bar'
import { SavedViewTabs, useSavedViews, type BuiltInView } from '@/components/data-table/saved-views'
import { useTableColumns } from '@/components/data-table/use-table-columns'
import { useDrawerNavigation, useDrawerSearch, useDrawerSiblings } from '@/components/drawer/drawer-state'
import { useBulkAction, useWorkflowAction } from '@/components/drawer/workflow-actions'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/feedback'
import { Page, PageHeader } from '@/components/ui/page'
import { api } from '@/lib/api/client'
import { useHubs, useRegions } from '@/lib/api/core'
import { downloadFrom } from '@/lib/api/downloads'
import type { DownloadLink, ServiceRequestListItem } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { addDays, businessToday, formatNumber } from '@/lib/format'
import { listSearchDefaults } from '@/lib/search/params'
import { useShortcut } from '@/lib/shortcuts'
import { apiQuery, srListQuery } from '../api'
import {
  ATTENTION_FLAGS,
  DELIVERY_TYPES,
  PIPELINE_STAGES,
  PROCUREMENT_TYPES,
  SR_STATUSES,
  type SrSearch,
} from '../search'
import { PauseDialog } from './pause-dialog'
import { srColumns, srMobileRow } from './sr-columns'

function builtInViews(): BuiltInView[] {
  const today = businessToday()
  return [
    { key: 'open', name: 'Open', search: {}, icon: Inbox },
    { key: 'waiting', name: 'Waiting for appointment', search: { stage: ['invited'] }, icon: Mail },
    { key: 'escalated', name: 'Escalated', search: { status: ['escalated'] }, icon: AlertTriangle },
    {
      key: 'booked-7',
      name: 'Booked next 7 days',
      search: { appointmentFrom: today, appointmentTo: addDays(today, 7) },
      icon: CalendarCheck,
    },
    { key: 'attention', name: 'Needs attention', search: { needsAttention: true }, icon: AlertTriangle },
    { key: 'vip', name: 'VIP', search: { vip: 'only' }, icon: Crown },
    { key: 'paused', name: 'Paused', search: { paused: true }, icon: PauseCircle },
    {
      key: 'closed',
      name: 'Closed',
      search: { includeClosed: true, stage: ['deployed', 'closed'] },
      icon: Ban,
    },
  ]
}

/**
 * Service requests (SCREENS.md §4.1, comp `table-drawer.html`): saved views → filter bar →
 * virtualized table with StageTrack status cells → SR drawer → floating bulk bar.
 */
export function SrListPage({
  search,
  onSearch,
}: {
  search: SrSearch
  onSearch: (patch: SearchPatch, replace?: boolean) => void
}) {
  const enums = useEnums()
  const hubs = useHubs()
  const regions = useRegions()
  const drawer = useDrawerNavigation()
  const { sr: openId } = useDrawerSearch()
  const canComms = useCan('sr.comms')
  const canManage = useCan('sr.manage')
  const canExport = useCan('sr.export')
  const [selected, setSelected] = useState<string[]>([])
  const [bulkDialog, setBulkDialog] = useState<'pause' | 'cancel' | null>(null)
  const bulk = useBulkAction('serviceRequest')

  const query = useQuery(srListQuery(apiQuery(search)))
  const rows = query.data?.data ?? []
  const columns = useMemo(() => srColumns(enums), [enums])
  const cols = useTableColumns('service-requests', columns)
  const builtIns = useMemo(builtInViews, [])
  const views = useSavedViews({
    route: '/service-requests',
    builtIns,
    search,
    defaults: listSearchDefaults,
  })
  useDrawerSiblings(
    'sr',
    rows.map((row) => row.id),
  )

  const openRow = rows.find((row) => row.id === openId)
  const nextMail = useWorkflowAction(
    'serviceRequest',
    openRow ?? { id: 0 },
    openRow?.number ?? '',
  )
  useShortcut(
    'n',
    () => {
      if (openRow?.availableActions.includes('send_next_mail'))
        nextMail.mutate({ action: 'send_next_mail' })
    },
    { enabled: canComms && Boolean(openRow), description: 'Send next mail', group: 'Page' },
  )

  const filters: FilterDef[] = useMemo(
    () => [
      {
        kind: 'multi',
        key: 'status',
        label: 'Status',
        options: SR_STATUSES.map((value) => ({
          value,
          label: enumLabel(enums, 'serviceRequestStatus', value),
        })),
      },
      {
        kind: 'multi',
        key: 'stage',
        label: 'Stage',
        options: PIPELINE_STAGES.map((value) => ({
          value,
          label: enumLabel(enums, 'pipelineStage', value),
        })),
      },
      {
        kind: 'multi',
        key: 'regionId',
        label: 'Region',
        options: [
          ...regions.map((region) => ({ value: String(region.id), label: region.name })),
          { value: 'none', label: 'Unresolved' },
        ],
      },
      {
        kind: 'multi',
        key: 'siteId',
        label: 'Hub',
        options: hubs.map((hub) => ({ value: String(hub.id), label: hub.name })),
      },
      {
        kind: 'multi',
        key: 'deliveryType',
        label: 'Delivery',
        options: DELIVERY_TYPES.map((value) => ({
          value,
          label: enumLabel(enums, 'deliveryType', value),
        })),
      },
      {
        kind: 'multi',
        key: 'procurementType',
        label: 'Procurement',
        options: PROCUREMENT_TYPES.map((value) => ({
          value,
          label: enumLabel(enums, 'procurementType', value),
        })),
      },
      {
        kind: 'multi',
        key: 'attention',
        label: 'Attention',
        options: ATTENTION_FLAGS.slice(0, 8).map((value) => ({
          value,
          label: enumLabel(enums, 'attentionFlag', value),
        })),
      },
      { kind: 'boolean', key: 'needsAttention', label: 'Needs attention' },
      {
        kind: 'single',
        key: 'vip',
        label: 'VIP',
        options: [
          { value: 'include', label: 'Include VIP' },
          { value: 'only', label: 'VIP only' },
          { value: 'exclude', label: 'Hide VIP' },
        ],
      },
      { kind: 'boolean', key: 'campus', label: 'Campus' },
      {
        kind: 'single',
        key: 'editorId',
        label: 'Editor',
        options: [
          { value: 'me', label: 'Me' },
          { value: 'none', label: 'Nobody' },
        ],
      },
      { kind: 'boolean', key: 'hasAppointment', label: 'Has appointment' },
      { kind: 'dateRange', id: 'appointment', label: 'Appointment', fromKey: 'appointmentFrom', toKey: 'appointmentTo' },
      { kind: 'dateRange', id: 'communication', label: 'Last mail', fromKey: 'communicationFrom', toKey: 'communicationTo' },
      { kind: 'dateRange', id: 'imported', label: 'Imported', fromKey: 'importedFrom', toKey: 'importedTo' },
      { kind: 'dateRange', id: 'closed', label: 'Closed', fromKey: 'closedFrom', toKey: 'closedTo' },
      { kind: 'boolean', key: 'paused', label: 'Paused' },
      { kind: 'boolean', key: 'includeClosed', label: 'Include closed' },
    ],
    [enums, hubs, regions],
  )

  const ids = selected.map(Number)
  const clear = () => setSelected([])
  const runBulk = (action: string, body?: Record<string, unknown>) =>
    bulk.mutateAsync({ action, ids, body }).then(clear)
  const exportRows = (onlySelected: boolean) =>
    downloadFrom(() =>
      api.post<DownloadLink>('/service-requests/export', {}, {
        query: onlySelected ? { ids, includeClosed: true, vip: 'include' } : apiQuery({ ...search, page: undefined, perPage: undefined }),
      }),
    )
  const filtered = Object.keys(apiQuery({ ...search, page: undefined, perPage: undefined, sort: undefined })).length > 0

  return (
    <Page>
      <PageHeader
        title="Service requests"
        meta={
          query.data
            ? `${formatNumber(query.data.meta.total)} ${search.includeClosed ? 'requests' : 'open'} · Globex Fleet AG`
            : 'Globex Fleet AG'
        }
        actions={
          canExport && (
            <Button icon={Download} onClick={() => void exportRows(false)}>
              Export
            </Button>
          )
        }
      />
      <SavedViewTabs views={views} onApply={(next) => onSearch(next as SearchPatch)} />
      <FilterBar
        search={search}
        onSearchChange={(patch) => onSearch(patch, true)}
        filters={filters}
        searchPlaceholder="Filter by SR, name, email or user id…"
        resultCount={query.data?.meta.total}
        end={
          <>
            <ColumnChooser
              columns={columns}
              prefs={cols.prefs}
              onChange={cols.setPrefs}
              onReset={cols.reset}
            />
            <DensityToggle />
          </>
        }
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <DataTable
          label="Service requests"
          columns={columns}
          columnPrefs={cols.prefs}
          rows={rows}
          getRowId={(row: ServiceRequestListItem) => String(row.id)}
          total={query.data?.meta.total}
          loading={query.isPending}
          fetching={query.isPlaceholderData}
          error={query.error}
          onRetry={() => void query.refetch()}
          sort={search.sort ?? '-importedAt'}
          onSortChange={(sort) => onSearch({ sort, page: undefined }, true)}
          selectable={canComms || canManage}
          selectedIds={selected}
          onSelectedIdsChange={setSelected}
          activeId={openId ? String(openId) : null}
          onOpen={(row) => drawer.open('sr', row.id)}
          mobileRow={srMobileRow}
          pagination={{
            page: search.page,
            perPage: search.perPage,
            total: query.data?.meta.total ?? 0,
            onPageChange: (page) => onSearch({ page }),
            onPerPageChange: (perPage) => onSearch({ perPage, page: undefined }),
          }}
          empty={
            filtered ? (
              <EmptyState
                icon={SearchX}
                title="No requests match these filters."
                actions={
                  <Button size="sm" onClick={() => onSearch(Object.fromEntries(Object.keys(search).map((k) => [k, undefined])))}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={Inbox} title="No service requests yet. Import an ITSM export to get started." />
            )
          }
        />
        <BulkActionBar count={selected.length} onClear={clear}>
          {canComms && (
            <>
              <BulkAction onClick={() => void runBulk('send_next_mail')}>
                <Mail /> Send next mail
              </BulkAction>
              <BulkAction onClick={() => setBulkDialog('pause')}>
                <Pause /> Pause…
              </BulkAction>
              <BulkAction onClick={() => void runBulk('resume_communication')}>
                <Play /> Resume
              </BulkAction>
              <BulkAction onClick={() => void runBulk('mark_hardware_unavailable')}>
                <AlertTriangle /> Hold
              </BulkAction>
              <BulkAction onClick={() => void runBulk('release_hardware_hold')}>
                <Unlock /> Release hold
              </BulkAction>
              <BulkAction onClick={() => void runBulk('release_vip')}>
                <Users /> Release VIP
              </BulkAction>
            </>
          )}
          {canManage && (
            <BulkAction onClick={() => setBulkDialog('cancel')}>
              <Ban /> Cancel…
            </BulkAction>
          )}
          {canExport && (
            <BulkAction onClick={() => void exportRows(true)}>
              <Download /> Export
            </BulkAction>
          )}
        </BulkActionBar>
      </div>
      <PauseDialog
        open={bulkDialog === 'pause'}
        onOpenChange={(open) => !open && setBulkDialog(null)}
        title={`Pause communication · ${selected.length} selected`}
        onSubmit={(body) => runBulk('pause_communication', body)}
      />
      <ConfirmDialog
        open={bulkDialog === 'cancel'}
        onOpenChange={(open) => !open && setBulkDialog(null)}
        title={`Cancel ${selected.length} service requests?`}
        description="New devices go back to stock and linked lease returns are unlinked."
        confirmLabel="Cancel requests"
        cancelLabel="Keep"
        destructive
        comment={{ required: true, label: 'Reason' }}
        pending={bulk.isPending}
        onConfirm={(comment) => runBulk('cancel', { comment }).then(() => setBulkDialog(null))}
      />
    </Page>
  )
}
