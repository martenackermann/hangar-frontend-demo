import { useQuery } from '@tanstack/react-query'
import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { ClipboardCheck, PanelRightOpen, X } from 'lucide-react'
import { useMemo } from 'react'
import { z } from 'zod'
import { DataTable, type DataColumn } from '@/components/data-table/data-table'
import { FilterBar, type FilterDef } from '@/components/data-table/filter-bar'
import { CopyableId, IdInk, StatusBadge } from '@/components/domain/status'
import { useDrawerNavigation } from '@/components/drawer/drawer-state'
import { DrawerError } from '@/components/drawer/drawer-states'
import { useWorkflowAction } from '@/components/drawer/workflow-actions'
import { Button, IconButton } from '@/components/ui/button'
import { EmptyState, Skeleton } from '@/components/ui/feedback'
import { Page, PageHeader, SectionHeading } from '@/components/ui/page'
import { useHubs, useRegions } from '@/lib/api/core'
import { detailQueries } from '@/lib/api/details'
import type { OrderClosingQueueItem } from '@/lib/api/types'
import { requirePermission } from '@/lib/auth/guards'
import { useCan } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import {
  boolParam,
  dateParam,
  idListParam,
  idParam,
  listSearchDefaults,
  pageParam,
  perPageParam,
  stringParam,
} from '@/lib/search/params'
import { useShortcut } from '@/lib/shortcuts'
import { stagingQueries } from '@/modules/staging/api'
import { Appointment } from '@/modules/staging/components/appointment'
import { ChecklistEditor, ChecklistProgress } from '@/modules/staging/components/checklist-editor'
import { HubSelect } from '@/modules/staging/components/hub-select'
import { StagingActions } from '@/modules/staging/components/staging-actions'
import { useHubId } from '@/modules/staging/hooks/use-hub'

/**
 * Order closing (SCREENS.md §5.3): `personalization_done` requests of a hub with their
 * software checklist; ticking every item enables **Close order** (`close_order`). No bulk:
 * each order needs a conscious check. The open row lives in `?selected=`.
 */
const searchSchema = z.object({
  siteId: idParam(),
  regionId: idListParam({ allowNone: true }),
  appointmentFrom: dateParam(),
  appointmentTo: dateParam(),
  checklistComplete: boolParam(),
  q: stringParam(),
  sort: stringParam(),
  page: pageParam(),
  perPage: perPageParam(),
  selected: idParam(),
})
type Search = z.infer<typeof searchSchema>

export const Route = createFileRoute('/_app/warehouse/order-closing')({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(listSearchDefaults)] },
  beforeLoad: requirePermission('sr.read'),
  staticData: { title: 'Order closing' },
  component: OrderClosingPage,
})

function OrderClosingPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const enums = useEnums()
  const hubs = useHubs()
  const regions = useRegions()
  const siteId = useHubId(search.siteId)
  const site = hubs.find((hub) => hub.id === siteId)
  const params = {
    siteId,
    regionId: search.regionId,
    appointmentFrom: search.appointmentFrom,
    appointmentTo: search.appointmentTo,
    checklistComplete: search.checklistComplete,
    q: search.q,
    sort: search.sort,
    page: search.page,
    perPage: search.perPage,
  }
  const query = useQuery({ ...stagingQueries.orderClosing(params), enabled: siteId !== undefined })
  const patch = (values: Partial<Search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...values }) })

  const filters: FilterDef[] = [
    {
      kind: 'multi',
      key: 'regionId',
      label: 'Region',
      options: regions.map((region) => ({ value: String(region.id), label: region.name })),
    },
    {
      kind: 'dateRange',
      id: 'appointment',
      label: 'Appointment',
      fromKey: 'appointmentFrom',
      toKey: 'appointmentTo',
    },
    {
      kind: 'boolean',
      key: 'checklistComplete',
      label: 'Software',
      trueLabel: 'Checklist complete',
      falseLabel: 'Checklist open',
    },
  ]

  const columns = useMemo<DataColumn<OrderClosingQueueItem>[]>(
    () => [
      {
        id: 'appointment',
        header: 'Appointment',
        sortField: 'appointmentStartAt',
        width: 130,
        cell: (row) => <Appointment startAt={row.appointmentStartAt} />,
      },
      {
        id: 'number',
        header: 'SR number',
        sortField: 'number',
        width: 120,
        locked: true,
        pinned: true,
        cell: (row) => <IdInk value={row.number} />,
      },
      {
        id: 'user',
        header: 'Employee',
        width: 170,
        cell: (row) => row.contact.displayName,
        title: (row) => row.contact.displayName,
      },
      {
        id: 'region',
        header: 'Region',
        width: 110,
        cell: (row) => row.region?.name ?? '—',
      },
      {
        id: 'devices',
        header: 'Devices',
        width: 320,
        cell: (row) => (
          <span className="truncate">
            {row.items
              .filter((item) => item.direction === 'deliver')
              .map(
                (item) =>
                  `${item.asset?.article?.name ?? item.requestedType ?? '?'}${
                    item.asset?.installationPlace ? ` (${item.asset.installationPlace})` : ''
                  }`,
              )
              .join(' · ')}
          </span>
        ),
      },
      {
        id: 'software',
        header: 'Software',
        width: 130,
        cell: (row) => <ChecklistProgress checklist={row.checklist} />,
      },
      {
        id: 'os',
        header: 'OS reinstall',
        width: 110,
        cell: (row) =>
          row.osReinstall ? enumLabel(enums, 'osReinstallTiming', row.osReinstall) : '—',
      },
      {
        id: 'status',
        header: 'Status',
        width: 170,
        cell: (row) => <StatusBadge entity="serviceRequestStatus" state={row.status} />,
      },
    ],
    [enums],
  )

  return (
    <Page>
      <PageHeader
        title="Order closing"
        meta={site ? `${site.name} · ${query.data?.meta.total ?? 0} waiting` : undefined}
        actions={<HubSelect value={siteId} onChange={(next) => patch({ siteId: next, page: 1 })} />}
      />
      <FilterBar
        search={search}
        onSearchChange={(values) => patch(values)}
        filters={filters}
        searchPlaceholder="SR, name, email…"
        resultCount={query.data?.meta.total}
      />
      <div
        className={
          search.selected
            ? 'grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_420px] max-xl:grid-cols-1'
            : 'flex min-h-0 flex-1 flex-col'
        }
      >
        <DataTable
          label="Orders waiting for closing"
          columns={columns}
          rows={query.data?.data ?? []}
          getRowId={(row) => String(row.id)}
          total={query.data?.meta.total}
          loading={query.isPending}
          fetching={query.isPlaceholderData}
          error={query.error}
          onRetry={() => void query.refetch()}
          sort={search.sort}
          onSortChange={(sort) => patch({ sort, page: 1 })}
          activeId={search.selected ? String(search.selected) : null}
          onOpen={(row) => patch({ selected: row.id })}
          pagination={{
            page: search.page,
            perPage: search.perPage,
            total: query.data?.meta.total ?? 0,
            onPageChange: (page) => patch({ page }),
            onPerPageChange: (perPage) => patch({ perPage, page: 1 }),
          }}
          empty={
            <EmptyState icon={ClipboardCheck} title="No orders waiting for closing at this hub">
              Orders appear here once personalization is finished.
            </EmptyState>
          }
        />
        {search.selected && (
          <ClosingPanel
            key={search.selected}
            srId={search.selected}
            onClose={() => patch({ selected: undefined })}
          />
        )}
      </div>
    </Page>
  )
}

function ClosingPanel({ srId, onClose }: { srId: number; onClose: () => void }) {
  const enums = useEnums()
  const drawer = useDrawerNavigation()
  const canEdit = useCan(['staging.close'])
  const detail = useQuery(detailQueries.serviceRequest(srId))
  const sr = detail.data
  const action = useWorkflowAction(
    'serviceRequest',
    sr ?? { id: srId, version: undefined },
    sr?.number ?? '',
  )
  useShortcut(
    'mod+enter',
    () => {
      if (sr?.availableActions.includes('close_order'))
        action.mutate({ action: 'close_order' }, { onSuccess: onClose })
    },
    { description: 'Close order', group: 'Order closing', allowInInput: true },
  )

  return (
    <aside
      aria-label="Order"
      className="min-h-0 overflow-y-auto border-l border-line bg-surface max-xl:border-t max-xl:border-l-0"
    >
      {detail.isPending ? (
        <div className="grid gap-3 p-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : detail.isError || !sr ? (
        <DrawerError error={detail.error} onRetry={() => void detail.refetch()} />
      ) : (
        <div className="grid gap-4 p-4">
          <header className="grid gap-2">
            <div className="flex items-center gap-2">
              <CopyableId value={sr.number} />
              <StatusBadge entity="serviceRequestStatus" state={sr.status} />
              <IconButton
                icon={PanelRightOpen}
                label="Open details"
                size="sm"
                className="ml-auto"
                onClick={() => drawer.open('sr', sr.id, 'staging')}
              />
              <IconButton icon={X} label="Close panel" size="sm" onClick={onClose} />
            </div>
            <p className="flex flex-wrap gap-x-3 text-sm text-fg-2">
              <span className="font-medium text-fg">{sr.contact.displayName}</span>
              <Appointment startAt={sr.appointmentStartAt} absolute />
              {sr.osReinstall && (
                <span>OS reinstall {enumLabel(enums, 'osReinstallTiming', sr.osReinstall)}</span>
              )}
            </p>
          </header>
          <div>
            <SectionHeading>Software checklist</SectionHeading>
            <ChecklistEditor
              srId={sr.id}
              editable={canEdit && sr.status === 'personalization_done'}
            />
          </div>
          <div>
            <SectionHeading>Devices</SectionHeading>
            <ul className="grid gap-1.5 text-sm">
              {sr.items
                .filter((item) => item.direction === 'deliver')
                .map((item) => (
                  <li key={item.slot} className="flex items-center gap-2">
                    <IdInk value={item.asset?.assetTag ?? item.asset?.serialNumber} />
                    <span className="truncate text-fg-2">
                      {item.asset?.article?.name ?? item.requestedType}
                    </span>
                    {item.asset?.installationPlace && (
                      <span className="hg-mono ml-auto text-fg-3">
                        {item.asset.installationPlace}
                      </span>
                    )}
                  </li>
                ))}
            </ul>
          </div>
          <div className="flex items-center gap-2 border-t border-line-subtle pt-3">
            <StagingActions
              entity={sr}
              actions={['close_order', 'reopen_personalization']}
              onDone={onClose}
            />
            {sr.availableActions.includes('close_order') && (
              <span className="text-xs text-fg-3">Ctrl+Enter</span>
            )}
            {!sr.availableActions.includes('close_order') &&
              !sr.blockedActions.some((b) => b.action === 'close_order') && (
                <Button variant="ghost" onClick={onClose}>
                  Done
                </Button>
              )}
          </div>
        </div>
      )}
    </aside>
  )
}
