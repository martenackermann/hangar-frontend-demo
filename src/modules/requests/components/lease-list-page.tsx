import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarClock,
  CalendarX,
  CircleCheck,
  CircleHelp,
  Download,
  Inbox,
  Link as LinkIcon,
  Mail,
  Pause,
  Play,
  SearchX,
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
import {
  useDrawerNavigation,
  useDrawerSearch,
  useDrawerSiblings,
} from '@/components/drawer/drawer-state'
import { useBulkAction, useWorkflowAction } from '@/components/drawer/workflow-actions'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/feedback'
import { Page, PageHeader } from '@/components/ui/page'
import { api } from '@/lib/api/client'
import { downloadFrom } from '@/lib/api/downloads'
import type { DownloadLink, LeaseReturnListItem } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { addDays, businessToday, formatNumber } from '@/lib/format'
import { listSearchDefaults } from '@/lib/search/params'
import { useShortcut } from '@/lib/shortcuts'
import { apiQuery, leaseListQuery } from '@/modules/requests/api'
import { ATTENTION_FLAGS, LEASE_STATUSES, type LeaseSearch } from '@/modules/requests/search'
import { leaseColumns, leaseMobileRow } from './lease-columns'
import { PauseDialog } from './pause-dialog'

const LEASE_ATTENTION = ATTENTION_FLAGS.filter((flag) =>
  ['contact_email_missing', 'retirement_passed', 'escalated_stale', 'itsm_closed'].includes(flag),
)

function builtInViews(): BuiltInView[] {
  const today = businessToday()
  return [
    { key: 'open', name: 'Open', search: {}, icon: Inbox },
    {
      key: 'due-30',
      name: 'Due in 30 days',
      search: { retirementFrom: today, retirementTo: addDays(today, 30) },
      icon: CalendarClock,
    },
    {
      key: 'overdue',
      name: 'Overdue',
      search: { retirementTo: addDays(today, -1) },
      icon: CalendarX,
    },
    { key: 'escalated', name: 'Escalated', search: { status: ['escalated'] }, icon: AlertTriangle },
    {
      key: 'probably-closed',
      name: 'Probably closed',
      search: { status: ['probably_closed'] },
      icon: CircleHelp,
    },
    {
      key: 'linked',
      name: 'Linked to SR',
      search: { includeClosed: true, status: ['replacement_ordered'] },
      icon: LinkIcon,
    },
  ]
}

/** Lease returns (SCREENS.md §4.2): saved views → filters → table → lease drawer → bulk bar. */
export function LeaseListPage({
  search,
  onSearch,
}: {
  search: LeaseSearch
  onSearch: (patch: SearchPatch, replace?: boolean) => void
}) {
  const enums = useEnums()
  const drawer = useDrawerNavigation()
  const { lr: openId } = useDrawerSearch()
  const canManage = useCan('lease.manage')
  const canExport = useCan('lease.export')
  const [selected, setSelected] = useState<string[]>([])
  const [bulkDialog, setBulkDialog] = useState<'pause' | 'close' | null>(null)
  const bulk = useBulkAction('leaseReturn')

  const query = useQuery(leaseListQuery(apiQuery(search)))
  const rows = query.data?.data ?? []
  const columns = useMemo(
    () => leaseColumns(enums, (id) => drawer.open('sr', id)),
    // drawer.open is stable in behaviour; the columns only depend on the enums
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enums],
  )
  const cols = useTableColumns('lease-returns', columns)
  const builtIns = useMemo(() => builtInViews(), [])
  const views = useSavedViews({
    route: '/lease-returns',
    builtIns,
    search,
    defaults: listSearchDefaults,
  })
  useDrawerSiblings(
    'lr',
    rows.map((row) => row.id),
  )

  const openRow = rows.find((row) => row.id === openId)
  const nextMail = useWorkflowAction('leaseReturn', openRow ?? { id: 0 }, openRow?.assetTag ?? '')
  useShortcut(
    'n',
    () => {
      if (openRow?.availableActions.includes('send_next_mail'))
        nextMail.mutate({ action: 'send_next_mail' })
    },
    { enabled: canManage && Boolean(openRow), description: 'Send next mail', group: 'Page' },
  )

  const filters: FilterDef[] = useMemo(
    () => [
      {
        kind: 'multi',
        key: 'status',
        label: 'Status',
        options: LEASE_STATUSES.map((value) => ({
          value,
          label: enumLabel(enums, 'leaseReturnStatus', value),
        })),
      },
      {
        kind: 'dateRange',
        id: 'retirement',
        label: 'Retirement',
        fromKey: 'retirementFrom',
        toKey: 'retirementTo',
      },
      {
        kind: 'dateRange',
        id: 'communication',
        label: 'Last mail',
        fromKey: 'communicationFrom',
        toKey: 'communicationTo',
      },
      { kind: 'boolean', key: 'linked', label: 'Linked to SR' },
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
        kind: 'multi',
        key: 'attention',
        label: 'Attention',
        options: LEASE_ATTENTION.map((value) => ({
          value,
          label: enumLabel(enums, 'attentionFlag', value),
        })),
      },
      { kind: 'boolean', key: 'needsAttention', label: 'Needs attention' },
      { kind: 'boolean', key: 'paused', label: 'Paused' },
      { kind: 'boolean', key: 'includeClosed', label: 'Include closed' },
    ],
    [enums],
  )

  const ids = selected.map(Number)
  const clear = () => setSelected([])
  const runBulk = (action: string, body?: Record<string, unknown>) =>
    bulk.mutateAsync({ action, ids, body }).then(clear)
  const exportRows = (onlySelected: boolean) =>
    downloadFrom(() =>
      api.post<DownloadLink>(
        '/lease-returns/export',
        {},
        {
          query: onlySelected
            ? { ids, includeClosed: true, vip: 'include' }
            : apiQuery({ ...search, page: undefined, perPage: undefined }),
        },
      ),
    )
  const filtered =
    Object.keys(apiQuery({ ...search, page: undefined, perPage: undefined, sort: undefined }))
      .length > 0

  return (
    <Page>
      <PageHeader
        title="Lease returns"
        meta={
          query.data
            ? `${formatNumber(query.data.meta.total)} ${search.includeClosed ? 'lease returns' : 'open'} · Globex Fleet AG`
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
      <SavedViewTabs views={views} onApply={(next) => onSearch(next)} />
      <FilterBar
        search={search}
        onSearchChange={(patch) => onSearch(patch, true)}
        filters={filters}
        searchPlaceholder="Filter by asset tag, serial or employee…"
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
          label="Lease returns"
          columns={columns}
          columnPrefs={cols.prefs}
          rows={rows}
          getRowId={(row: LeaseReturnListItem) => String(row.id)}
          total={query.data?.meta.total}
          loading={query.isPending}
          fetching={query.isPlaceholderData}
          error={query.error}
          onRetry={() => void query.refetch()}
          sort={search.sort ?? 'retirementDate'}
          onSortChange={(sort) => onSearch({ sort, page: undefined }, true)}
          selectable={canManage}
          selectedIds={selected}
          onSelectedIdsChange={setSelected}
          activeId={openId ? String(openId) : null}
          onOpen={(row) => drawer.open('lr', row.id)}
          mobileRow={leaseMobileRow}
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
                title="No lease returns match these filters."
                actions={
                  <Button
                    size="sm"
                    onClick={() =>
                      onSearch(Object.fromEntries(Object.keys(search).map((k) => [k, undefined])))
                    }
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Inbox}
                title="No lease returns yet. Import the lease export to start the reminder chain."
              />
            )
          }
        />
        <BulkActionBar count={selected.length} onClear={clear}>
          {canManage && (
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
              <BulkAction onClick={() => void runBulk('release_vip')}>
                <Users /> Release VIP
              </BulkAction>
              <BulkAction onClick={() => setBulkDialog('close')}>
                <CircleCheck /> Close…
              </BulkAction>
            </>
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
        open={bulkDialog === 'close'}
        onOpenChange={(open) => !open && setBulkDialog(null)}
        title={`Close ${selected.length} lease returns?`}
        description="Closed lease returns get no further mails. They can be reopened later."
        confirmLabel="Close lease returns"
        cancelLabel="Keep open"
        comment={{ required: true, label: 'Reason' }}
        pending={bulk.isPending}
        onConfirm={(comment) => runBulk('close', { comment }).then(() => setBulkDialog(null))}
      />
    </Page>
  )
}
