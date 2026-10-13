import { useQuery } from '@tanstack/react-query'
import { createFileRoute, stripSearchParams, useNavigate } from '@tanstack/react-router'
import { FileUp, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useState } from 'react'
import { ColumnChooser } from '@/components/data-table/column-chooser'
import { DataTable, type DataColumn } from '@/components/data-table/data-table'
import { useMediaQuery } from '@/lib/use-media-query'
import { FilterBar, type FilterDef } from '@/components/data-table/filter-bar'
import { useTableColumns } from '@/components/data-table/use-table-columns'
import { Button, IconButton } from '@/components/ui/button'
import { EmptyState, FlagBadge } from '@/components/ui/feedback'
import { Page, PageHeader } from '@/components/ui/page'
import type { ImportJobStatus, ImportJobSummary, ImportType } from '@/lib/api/types'
import { requirePermission } from '@/lib/auth/guards'
import { useCan } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import {
  boolParam,
  dateParam,
  listParam,
  listSearchDefaults,
  listSearchSchema,
} from '@/lib/search/params'
import { useShortcut } from '@/lib/shortcuts'
import { importQueries } from '@/modules/imports/api'
import { FormatsPanel } from '@/modules/imports/components/formats-panel'
import { formatElapsed } from '@/modules/imports/components/import-format'
import { ImportStatusCell } from '@/modules/imports/components/import-status'
import { ImportWizard } from '@/modules/imports/components/import-wizard'

/** Data › Imports (SCREENS.md §8.1). Owner: H2 (Import & Master data). */
const IMPORT_TYPES = [
  'service_requests',
  'lease_returns',
  'contacts',
  'assets_new',
  'asset_status_sync',
] as const satisfies readonly ImportType[]
const IMPORT_STATUSES = [
  'queued',
  'processing',
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
] as const satisfies readonly ImportJobStatus[]

const searchSchema = listSearchSchema.extend({
  type: listParam(IMPORT_TYPES),
  status: listParam(IMPORT_STATUSES),
  from: dateParam(),
  to: dateParam(),
  /** Opens the upload wizard (⌘K "New import…", key `n`). */
  upload: boolParam(),
})

export const Route = createFileRoute('/_app/data/imports/')({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(listSearchDefaults)] },
  beforeLoad: requirePermission('imports.read'),
  staticData: { title: 'Imports' },
  component: ImportsPage,
})

function ImportsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const enums = useEnums()
  const canCreate = useCan('imports.create')
  const wide = useMediaQuery('(min-width: 1280px)')
  const [formatsOpen, setFormatsOpen] = useState(true)
  const patch = (p: Record<string, unknown>) =>
    void navigate({ search: (prev) => ({ ...prev, ...p }) })
  const query = useQuery(
    importQueries.list({
      type: search.type,
      status: search.status,
      from: search.from,
      to: search.to,
      page: search.page,
      perPage: search.perPage,
      sort: search.sort,
    }),
  )
  const openDetail = (row: ImportJobSummary) =>
    void navigate({ to: '/data/imports/$importId', params: { importId: String(row.id) } })

  useShortcut('n', () => patch({ upload: true }), {
    enabled: canCreate && !search.upload,
    description: 'New import',
    group: 'Page',
  })

  const columns: DataColumn<ImportJobSummary>[] = [
    {
      id: 'createdAt',
      header: 'Created',
      sortField: 'createdAt',
      width: 140,
      locked: true,
      title: (row) => formatDateTime(row.createdAt),
      cell: (row) => <span className="tabular-nums">{formatRelative(row.createdAt)}</span>,
    },
    {
      id: 'type',
      header: 'Type',
      width: 150,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{enumLabel(enums, 'importType', row.type)}</span>
          {!row.typeDetected && <span className="text-2xs text-fg-3">forced</span>}
        </span>
      ),
    },
    {
      id: 'file',
      header: 'File',
      width: 230,
      title: (row) => row.originalFilename,
      cell: (row) => <span className="truncate font-mono text-xs">{row.originalFilename}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      width: 210,
      cell: (row) => <ImportStatusCell job={row} />,
    },
    {
      id: 'rows',
      header: 'Rows',
      width: 70,
      align: 'end',
      cell: (row) => <span className="font-mono">{formatNumber(row.counts.total)}</span>,
    },
    {
      id: 'applied',
      header: 'Created / Updated / Unchanged',
      width: 210,
      align: 'end',
      cell: (row) => (
        <span className="font-mono text-xs">
          <span className="text-tone-done-fg">{formatNumber(row.counts.created)}</span>
          <span className="text-fg-3"> / </span>
          <span className="text-tone-outreach-fg">{formatNumber(row.counts.updated)}</span>
          <span className="text-fg-3"> / </span>
          <span className="text-fg-2">{formatNumber(row.counts.unchanged)}</span>
        </span>
      ),
    },
    {
      id: 'issues',
      header: 'Errors / Warnings',
      width: 140,
      align: 'end',
      cell: (row) => (
        <span className="font-mono text-xs">
          <span className={row.counts.errors ? 'text-tone-critical-fg' : 'text-fg-3'}>
            {formatNumber(row.counts.errors)}
          </span>
          <span className="text-fg-3"> / </span>
          <span className={row.counts.warnings ? 'text-tone-caution-fg' : 'text-fg-3'}>
            {formatNumber(row.counts.warnings)}
          </span>
        </span>
      ),
    },
    {
      id: 'dryRun',
      header: 'Dry run',
      width: 90,
      cell: (row) => (row.dryRun ? <FlagBadge>Dry run</FlagBadge> : null),
    },
    {
      id: 'createdBy',
      header: 'By',
      width: 150,
      cell: (row) => <span className="truncate">{row.createdBy.displayName}</span>,
    },
    {
      id: 'duration',
      header: 'Duration',
      width: 100,
      align: 'end',
      cell: (row) => (
        <span className="font-mono text-xs text-fg-2">
          {row.startedAt ? formatElapsed(row.startedAt, row.finishedAt) : '—'}
        </span>
      ),
    },
  ]
  const cols = useTableColumns('imports', columns)

  const filters: FilterDef[] = [
    {
      kind: 'multi',
      key: 'type',
      label: 'Type',
      options: IMPORT_TYPES.map((value) => ({
        value,
        label: enumLabel(enums, 'importType', value),
      })),
    },
    {
      kind: 'multi',
      key: 'status',
      label: 'Status',
      options: IMPORT_STATUSES.map((value) => ({
        value,
        label: enumLabel(enums, 'importJobStatus', value),
      })),
    },
    { kind: 'dateRange', id: 'created', label: 'Created', fromKey: 'from', toKey: 'to' },
  ]

  const total = query.data?.meta.total
  const newImport = canCreate ? (
    <Button variant="primary" icon={FileUp} shortcut="n" onClick={() => patch({ upload: true })}>
      New import
    </Button>
  ) : null

  return (
    <Page>
      <PageHeader
        title="Imports"
        meta={
          total !== undefined
            ? `${formatNumber(total)} imports · ITSM and partner exports`
            : undefined
        }
        actions={
          <>
            {wide && (
              <IconButton
                icon={formatsOpen ? PanelRightClose : PanelRightOpen}
                label={formatsOpen ? 'Hide formats' : 'Show formats'}
                onClick={() => setFormatsOpen((open) => !open)}
              />
            )}
            {newImport}
          </>
        }
      />
      <FilterBar
        search={search}
        onSearchChange={patch}
        filters={filters}
        resultCount={total}
        end={
          <ColumnChooser
            columns={columns}
            prefs={cols.prefs}
            onChange={cols.setPrefs}
            onReset={cols.reset}
          />
        }
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DataTable
            label="Imports"
            columns={columns}
            columnPrefs={cols.prefs}
            rows={query.data?.data ?? []}
            getRowId={(row) => String(row.id)}
            total={total}
            loading={query.isPending}
            fetching={query.isPlaceholderData}
            error={query.error}
            onRetry={() => void query.refetch()}
            sort={search.sort ?? '-createdAt'}
            onSortChange={(sort) => patch({ sort, page: 1 })}
            onOpen={openDetail}
            pagination={{
              page: search.page,
              perPage: search.perPage,
              total: total ?? 0,
              onPageChange: (page) => patch({ page }),
              onPerPageChange: (perPage) => patch({ perPage, page: 1 }),
            }}
            mobileRow={(row) => (
              <div className="grid gap-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{enumLabel(enums, 'importType', row.type)}</span>
                  <span className="text-xs text-fg-3">{formatRelative(row.createdAt)}</span>
                </span>
                <ImportStatusCell job={row} />
              </div>
            )}
            empty={
              <EmptyState icon={FileUp} title="No imports yet." actions={newImport}>
                Upload an ITSM export — the type is detected from its columns.
              </EmptyState>
            }
          />
        </div>
        {wide && formatsOpen && <FormatsPanel className="w-[340px] shrink-0" />}
      </div>
      <ImportWizard
        open={Boolean(search.upload) && canCreate}
        onOpenChange={(open) => patch({ upload: open ? true : undefined })}
        onStarted={(importJobId) =>
          void navigate({
            to: '/data/imports/$importId',
            params: { importId: String(importJobId) },
          })
        }
      />
    </Page>
  )
}
