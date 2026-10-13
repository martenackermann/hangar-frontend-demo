import { useQuery } from '@tanstack/react-query'
import {
  Archive,
  Boxes,
  CircleSlash,
  Download,
  Link2,
  MapPinOff,
  Pencil,
  SearchX,
  Undo2,
} from 'lucide-react'
import { useState } from 'react'
import { BulkAction, BulkActionBar } from '@/components/data-table/bulk-action-bar'
import { ColumnChooser } from '@/components/data-table/column-chooser'
import { DataTable, type DataColumn } from '@/components/data-table/data-table'
import { FilterBar, type FilterDef } from '@/components/data-table/filter-bar'
import { SavedViewTabs, useSavedViews, type BuiltInView } from '@/components/data-table/saved-views'
import { useTableColumns } from '@/components/data-table/use-table-columns'
import { assetStatusLabel } from '@/components/drawer/asset-drawer'
import {
  useDrawerNavigation,
  useDrawerSearch,
  useDrawerSiblings,
} from '@/components/drawer/drawer-state'
import { useBulkAction } from '@/components/drawer/workflow-actions'
import { IdInk, StatusBadge } from '@/components/domain/status'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { Page, PageHeader } from '@/components/ui/page'
import { useHubs } from '@/lib/api/core'
import { downloadFrom } from '@/lib/api/downloads'
import type { AssetListItem } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatAge, formatDate } from '@/lib/format'
import { listSearchDefaults } from '@/lib/search/params'
import { exportRequest, stockQueries, type AssetListParams } from '../api'
import { CorrectDialog, MarkMissingDialog } from './asset-dialogs'

export interface AssetsSearch {
  q?: string | undefined
  sort?: string | undefined
  page: number
  perPage: number
  view?: string | undefined
  status?: string[] | undefined
  siteId?: number[] | undefined
  locationType?: string[] | undefined
  locationId?: number[] | undefined
  articleId?: number[] | undefined
  category?: string[] | undefined
  source?: string[] | undefined
  installationPlace?: string | undefined
  hasInstallationPlace?: boolean | undefined
  serviceRequestId?: number | undefined
  checkedInFrom?: string | undefined
  checkedInTo?: string | undefined
}

const BUILT_IN_VIEWS: BuiltInView[] = [
  { key: 'all', name: 'All assets', search: {}, icon: Boxes },
  { key: 'in-stock', name: 'In stock', search: { status: ['available'] }, icon: Archive },
  {
    key: 'workflow',
    name: 'In workflow',
    search: { status: ['assigned', 'prepared', 'provided'] },
    icon: Link2,
  },
  {
    key: 'collected',
    name: 'Collected (awaiting return)',
    search: { status: ['collected'] },
    icon: Undo2,
  },
  { key: 'missing', name: 'Missing', search: { status: ['missing'] }, icon: MapPinOff },
  {
    key: 'off-fleet',
    name: 'Off fleet',
    search: { status: ['deactivated_returned', 'deactivated_bought_out', 'deactivated_disposed'] },
    icon: CircleSlash,
  },
]

function useColumns(): DataColumn<AssetListItem>[] {
  const enums = useEnums()
  const drawer = useDrawerNavigation()
  return [
    {
      id: 'serial',
      header: 'Serial',
      cell: (row) => <span className="hg-mono">{row.serialNumber}</span>,
      sortField: 'serialNumber',
      width: 140,
      locked: true,
      pinned: true,
    },
    {
      id: 'tag',
      header: 'Asset tag',
      cell: (row) => <IdInk value={row.assetTag} />,
      sortField: 'assetTag',
      width: 110,
    },
    {
      id: 'article',
      header: 'Article',
      cell: (row) => (
        <span className="truncate">
          {row.article?.name ?? row.model ?? 'Unknown model'}
          {row.article && row.model && (
            <span className="ml-1.5 text-xs text-fg-3">{row.model}</span>
          )}
        </span>
      ),
      title: (row) => row.article?.name ?? row.model,
      width: 260,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (row) => (
        <StatusBadge
          entity="assetStatus"
          state={row.status}
          label={assetStatusLabel(row, enumLabel(enums, 'assetStatus', row.status))}
        />
      ),
      sortField: 'status',
      width: 190,
    },
    {
      id: 'location',
      header: 'Location',
      cell: (row) => row.location.name,
      width: 170,
    },
    {
      id: 'place',
      header: 'Place',
      cell: (row) =>
        row.installationPlace ? <span className="hg-mono">{row.installationPlace}</span> : null,
      width: 80,
    },
    {
      id: 'sr',
      header: 'SR',
      cell: (row) =>
        row.serviceRequest ? (
          <button
            type="button"
            className="hover:underline"
            onClick={(event) => {
              event.stopPropagation()
              if (row.serviceRequest) drawer.open('sr', row.serviceRequest.id)
            }}
          >
            <IdInk value={row.serviceRequest.number} />
          </button>
        ) : null,
      width: 110,
    },
    {
      id: 'user',
      header: 'Assigned user',
      cell: (row) => row.assignedContact?.displayName,
      width: 160,
    },
    {
      id: 'checkedIn',
      header: 'Checked in',
      cell: (row) => (row.checkedInAt ? formatDate(row.checkedInAt) : null),
      sortField: 'checkedInAt',
      width: 110,
    },
    {
      id: 'changed',
      header: 'Last change',
      cell: (row) => <span className="font-mono text-fg-2">{formatAge(row.statusChangedAt)}</span>,
      title: (row) => row.statusChangedAt,
      sortField: 'statusChangedAt',
      width: 100,
      align: 'end',
    },
  ]
}

export function AssetsPage({
  search,
  onSearchChange,
  onReplaceSearch,
}: {
  search: AssetsSearch
  onSearchChange: (patch: Record<string, unknown>) => void
  onReplaceSearch: (next: Record<string, unknown>) => void
}) {
  const enums = useEnums()
  const hubs = useHubs()
  const canUpdate = useCan('assets.update')
  const canExport = useCan('assets.export')
  const drawer = useDrawerNavigation()
  const { asset } = useDrawerSearch()
  const columns = useColumns()
  const cols = useTableColumns('stock-assets', columns)
  const [selected, setSelected] = useState<string[]>([])
  const [bulk, setBulk] = useState<'mark_missing' | 'correct' | null>(null)
  const bulkAction = useBulkAction('asset')
  const views = useSavedViews({
    route: '/stock/assets',
    builtIns: BUILT_IN_VIEWS,
    search: search as unknown as Record<string, unknown>,
    defaults: listSearchDefaults,
  })
  const { view: _view, ...params } = search
  void _view
  const listParams: AssetListParams = params
  const query = useQuery(stockQueries.assets(listParams))
  useDrawerSiblings('asset', query.data?.data.map((row) => row.id) ?? [])

  const filters: FilterDef[] = [
    {
      kind: 'multi',
      key: 'status',
      label: 'Status',
      options: enums.assetStatus.map((s) => ({ value: s.value, label: s.label })),
    },
    {
      kind: 'multi',
      key: 'siteId',
      label: 'Hub',
      options: hubs.map((h) => ({ value: String(h.id), label: h.name })),
    },
    {
      kind: 'multi',
      key: 'locationType',
      label: 'Location type',
      options: enums.locationType.map((s) => ({ value: s.value, label: s.label })),
    },
    {
      kind: 'multi',
      key: 'category',
      label: 'Category',
      options: enums.articleCategory.map((s) => ({ value: s.value, label: s.label })),
    },
    {
      kind: 'multi',
      key: 'source',
      label: 'Source',
      options: enums.assetSource.map((s) => ({ value: s.value, label: s.label })),
    },
    {
      kind: 'boolean',
      key: 'hasInstallationPlace',
      label: 'Installation place',
      trueLabel: 'Has a place',
      falseLabel: 'No place',
    },
    {
      kind: 'dateRange',
      id: 'checkedIn',
      label: 'Checked in',
      fromKey: 'checkedInFrom',
      toKey: 'checkedInTo',
    },
  ]
  const ids = selected.map(Number)
  const runBulk = (action: 'mark_missing' | 'correct') => async (body: Record<string, unknown>) => {
    const result = await bulkAction.mutateAsync({ action, ids, body })
    setSelected(result.failed.map((f) => String(f.id)))
    return result
  }

  return (
    <Page className="relative">
      <PageHeader
        title="Assets"
        meta={
          search.installationPlace
            ? `Installation place ${search.installationPlace}`
            : 'Every device: stock, workflow, at users, returns, off fleet'
        }
        actions={
          canExport && (
            <Button
              icon={Download}
              onClick={() => void downloadFrom(exportRequest('/assets/export', listParams))}
            >
              Export CSV
            </Button>
          )
        }
      />
      <SavedViewTabs views={views} onApply={(next) => onReplaceSearch(next)} />
      <FilterBar
        search={search as unknown as Record<string, unknown>}
        onSearchChange={onSearchChange}
        filters={filters}
        searchPlaceholder="Filter by serial, asset tag, place, model…"
        resultCount={query.data?.meta.total}
        end={
          <ColumnChooser
            columns={columns}
            prefs={cols.prefs}
            onChange={cols.setPrefs}
            onReset={cols.reset}
          />
        }
      />
      <DataTable
        label="Assets"
        columns={columns}
        columnPrefs={cols.prefs}
        rows={query.data?.data ?? []}
        getRowId={(row) => String(row.id)}
        total={query.data?.meta.total}
        loading={query.isPending}
        fetching={query.isPlaceholderData}
        error={query.error}
        onRetry={() => void query.refetch()}
        sort={search.sort ?? '-statusChangedAt'}
        onSortChange={(sort) => onSearchChange({ sort, page: 1 })}
        selectable={canUpdate}
        selectedIds={selected}
        onSelectedIdsChange={setSelected}
        activeId={asset ? String(asset) : null}
        onOpen={(row) => drawer.open('asset', row.id)}
        pagination={{
          page: search.page,
          perPage: search.perPage,
          total: query.data?.meta.total ?? 0,
          onPageChange: (page) => onSearchChange({ page }),
          onPerPageChange: (perPage) => onSearchChange({ perPage, page: 1 }),
        }}
        mobileRow={(row) => (
          <div className="grid gap-0.5">
            <span className="flex items-center gap-2">
              <span className="hg-mono">{row.assetTag ?? row.serialNumber}</span>
              <StatusBadge entity="assetStatus" state={row.status} size="sm" />
            </span>
            <span className="text-xs text-fg-3">
              {row.article?.name ?? row.model} · {row.location.name}
            </span>
          </div>
        )}
        empty={
          <EmptyState icon={SearchX} title="No assets match these filters.">
            Remove a filter or search for a serial number.
          </EmptyState>
        }
      />
      {canUpdate && (
        <BulkActionBar count={selected.length} onClear={() => setSelected([])}>
          <BulkAction onClick={() => setBulk('mark_missing')}>
            <MapPinOff /> Mark missing
          </BulkAction>
          <BulkAction onClick={() => setBulk('correct')}>
            <Pencil /> Correct
          </BulkAction>
        </BulkActionBar>
      )}
      {bulk === 'mark_missing' && (
        <MarkMissingDialog
          open
          onOpenChange={(open) => !open && setBulk(null)}
          subject={`${selected.length} assets`}
          pending={bulkAction.isPending}
          submit={runBulk('mark_missing')}
        />
      )}
      {bulk === 'correct' && (
        <CorrectDialog
          open
          onOpenChange={(open) => !open && setBulk(null)}
          subject={`${selected.length} assets`}
          pending={bulkAction.isPending}
          submit={runBulk('correct')}
        />
      )}
    </Page>
  )
}
