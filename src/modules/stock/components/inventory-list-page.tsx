import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Download, ScanLine, Warehouse } from 'lucide-react'
import { useState } from 'react'
import { DataTable, type DataColumn } from '@/components/data-table/data-table'
import { FilterBar, type FilterDef } from '@/components/data-table/filter-bar'
import { StatusBadge } from '@/components/domain/status'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState, ProgressMeter, Skeleton } from '@/components/ui/feedback'
import { Page, PageHeader } from '@/components/ui/page'
import { notify } from '@/components/ui/toast'
import { useSites } from '@/lib/api/core'
import { downloadGet } from '@/lib/api/downloads'
import { isApiError } from '@/lib/api/errors'
import type { InventorySummary, Site } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { useEnums } from '@/lib/enums'
import { formatDate, formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { stockQueries, useOpenInventory } from '../api'

export interface InventoryListSearch {
  siteId?: number[] | undefined
  status?: string[] | undefined
  page: number
  perPage: number
}

const REPORTS = [
  { kind: 'missing', label: 'Missing' },
  { kind: 'wrong_location', label: 'Wrong location' },
  { kind: 'unknown', label: 'Unknown' },
] as const

function counted(summary: InventorySummary['summary']) {
  return summary.expected - summary.missing
}

const columns: DataColumn<InventorySummary>[] = [
  {
    id: 'site',
    header: 'Site',
    cell: (row) => row.site.name,
    width: 140,
    locked: true,
    pinned: true,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <StatusBadge entity="inventoryStatus" state={row.status} />,
    width: 130,
  },
  {
    id: 'opened',
    header: 'Opened',
    cell: (row) => `${formatDateTime(row.openedAt)} · ${row.openedBy.displayName}`,
    sortField: 'openedAt',
    width: 240,
  },
  {
    id: 'closed',
    header: 'Closed',
    cell: (row) => (row.closedAt ? formatDateTime(row.closedAt) : null),
    width: 150,
  },
  {
    id: 'countDate',
    header: 'Count date',
    cell: (row) => (row.countDate ? formatDate(row.countDate) : null),
    width: 120,
  },
  {
    id: 'expected',
    header: 'Expected',
    cell: (row) => formatNumber(row.summary.expected),
    align: 'end',
    width: 90,
  },
  {
    id: 'matched',
    header: 'Matched',
    cell: (row) => formatNumber(row.summary.matched),
    align: 'end',
    width: 90,
  },
  {
    id: 'missing',
    header: 'Missing',
    cell: (row) => (
      <span
        className={
          row.summary.missing > 0 && row.status !== 'open' ? 'text-tone-critical-fg' : undefined
        }
      >
        {formatNumber(row.summary.missing)}
      </span>
    ),
    align: 'end',
    width: 90,
  },
  {
    id: 'wrong',
    header: 'Wrong location',
    cell: (row) => formatNumber(row.summary.wrongLocation),
    align: 'end',
    width: 120,
  },
  {
    id: 'unknown',
    header: 'Unknown',
    cell: (row) => formatNumber(row.summary.unknown),
    align: 'end',
    width: 90,
  },
  {
    id: 'reports',
    header: 'Reports',
    cell: (row) =>
      row.status === 'closed' ? (
        <span className="flex gap-1">
          {REPORTS.map((report) => (
            <IconButton
              key={report.kind}
              size="sm"
              icon={Download}
              label={`${report.label} report (CSV)`}
              onClick={(event) => {
                event.stopPropagation()
                void downloadGet(`/inventories/${row.id}/reports/${report.kind}`)
              }}
            />
          ))}
        </span>
      ) : null,
    width: 120,
  },
]

function SiteCard({
  site,
  open,
  last,
  loading,
}: {
  site: Site
  open?: InventorySummary
  last?: InventorySummary
  loading: boolean
}) {
  const canManage = useCan('inventory.manage')
  const canScan = useCan('inventory.scan')
  const navigate = useNavigate()
  const mutation = useOpenInventory()
  const [confirm, setConfirm] = useState(false)
  const start = async () => {
    try {
      const inventory = await mutation.mutateAsync({ siteId: site.id })
      setConfirm(false)
      notify.success(`Inventory ${site.name} started`, {
        description: `${formatNumber(inventory.progress.expected)} devices expected`,
      })
      void navigate({
        to: '/stock/inventory/$inventoryId',
        params: { inventoryId: String(inventory.id) },
      })
    } catch (error) {
      notify.error(isApiError(error) ? error.title : 'Could not start the inventory', {
        description: isApiError(error) ? error.detail : undefined,
      })
    }
  }
  return (
    <section
      className="grid content-between gap-3 rounded-sm border border-line bg-surface p-4"
      aria-label={site.name}
    >
      <header className="flex items-start gap-2">
        <div>
          <h2 className="font-semibold">{site.name}</h2>
          <p className="text-xs text-fg-3">
            {site.kind === 'campus'
              ? 'Campus returns'
              : 'Hub · goods in, staging, goods out, returns'}
          </p>
        </div>
      </header>
      {loading ? (
        <Skeleton className="w-40" />
      ) : open ? (
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span>
              <b className="text-lg font-semibold">{formatNumber(counted(open.summary))}</b>
              <span className="text-fg-3"> of {formatNumber(open.summary.expected)} counted</span>
            </span>
            <span className="font-mono text-fg-2">
              {open.summary.expected
                ? Math.round((counted(open.summary) * 100) / open.summary.expected)
                : 0}{' '}
              %
            </span>
          </div>
          <ProgressMeter
            label={`${site.name} inventory progress`}
            valueText={`${counted(open.summary)} of ${open.summary.expected} counted`}
            max={open.summary.expected}
            segments={[
              { value: open.summary.matched, tone: 'done', label: 'Matched' },
              {
                value: counted(open.summary) - open.summary.matched,
                tone: 'caution',
                label: 'Wrong zone',
              },
            ]}
          />
          <p className="text-xs text-fg-3">
            Opened {formatRelative(open.openedAt)} by {open.openedBy.displayName} ·{' '}
            {open.summary.wrongLocation} wrong location · {open.summary.unknown} unknown
          </p>
        </div>
      ) : (
        <p className="text-sm text-fg-3">
          {last
            ? `Last count ${last.countDate ? formatDate(last.countDate) : formatDate(last.openedAt)} · ${last.summary.missing} missing`
            : 'No inventory yet.'}
        </p>
      )}
      <div className="flex gap-2">
        {open ? (
          <Button asChild variant={canScan ? 'primary' : 'secondary'} icon={ScanLine}>
            <Link to="/stock/inventory/$inventoryId" params={{ inventoryId: String(open.id) }}>
              {canScan ? 'Continue scanning' : 'Open'}
            </Link>
          </Button>
        ) : (
          canManage && (
            <Button icon={ScanLine} onClick={() => setConfirm(true)}>
              Start inventory
            </Button>
          )
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Start an inventory at ${site.name}?`}
        description="Counters scan every device on site; the expected set is evaluated live until you close the inventory."
        confirmLabel="Start inventory"
        pending={mutation.isPending}
        onConfirm={start}
      />
    </section>
  )
}

export function InventoryListPage({
  search,
  onSearchChange,
}: {
  search: InventoryListSearch
  onSearchChange: (patch: Record<string, unknown>) => void
}) {
  const enums = useEnums()
  const sites = useSites().filter((s) => s.isActive)
  const navigate = useNavigate()
  const recent = useQuery(stockQueries.inventories({ perPage: 100 }))
  const query = useQuery(
    stockQueries.inventories({
      siteId: search.siteId,
      status: search.status,
      page: search.page,
      perPage: search.perPage,
    }),
  )
  const all = recent.data?.data ?? []
  const filters: FilterDef[] = [
    {
      kind: 'multi',
      key: 'siteId',
      label: 'Site',
      options: sites.map((s) => ({ value: String(s.id), label: s.name })),
    },
    {
      kind: 'multi',
      key: 'status',
      label: 'Status',
      options: enums.inventoryStatus.map((s) => ({ value: s.value, label: s.label })),
    },
  ]
  return (
    <Page className="overflow-y-auto">
      <PageHeader title="Inventory" meta="Stock-takes per hub and Campus" />
      <div className="grid shrink-0 grid-cols-4 gap-3 px-4 pb-4 max-xl:grid-cols-2 max-md:grid-cols-1">
        {sites.map((site) => (
          <SiteCard
            key={site.id}
            site={site}
            loading={recent.isPending}
            open={all.find((i) => i.site.id === site.id && i.status === 'open')}
            last={all.find((i) => i.site.id === site.id && i.status === 'closed')}
          />
        ))}
      </div>
      <h2 className="px-4 pb-1 text-sm font-semibold">History</h2>
      <FilterBar
        search={search as unknown as Record<string, unknown>}
        onSearchChange={onSearchChange}
        filters={filters}
        resultCount={query.data?.meta.total}
      />
      <DataTable
        label="Inventories"
        columns={columns}
        rows={query.data?.data ?? []}
        getRowId={(row) => String(row.id)}
        total={query.data?.meta.total}
        loading={query.isPending}
        fetching={query.isPlaceholderData}
        error={query.error}
        onRetry={() => void query.refetch()}
        onOpen={(row) =>
          void navigate({
            to: '/stock/inventory/$inventoryId',
            params: { inventoryId: String(row.id) },
          })
        }
        pagination={{
          page: search.page,
          perPage: search.perPage,
          total: query.data?.meta.total ?? 0,
          onPageChange: (page) => onSearchChange({ page }),
          onPerPageChange: (perPage) => onSearchChange({ perPage, page: 1 }),
        }}
        empty={<EmptyState icon={Warehouse} title="No inventories yet." />}
        className="min-h-80"
      />
    </Page>
  )
}
