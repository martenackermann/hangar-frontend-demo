import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  CircleAlert,
  Download,
  FileText,
  OctagonX,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { DataTable, type DataColumn } from '@/components/data-table/data-table'
import { useDrawerNavigation } from '@/components/drawer/drawer-state'
import { ImportProgress } from '@/components/domain/file-drop'
import { KpiStrip, StatTile } from '@/components/domain/stat-tile'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Banner, EmptyState, FlagBadge, ToneBadge } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { Page, PageHeader } from '@/components/ui/page'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/feedback'
import { api } from '@/lib/api/client'
import { coreQueries } from '@/lib/api/core'
import { downloadFrom } from '@/lib/api/downloads'
import type { ImportJobDetail, ImportRowIssue, SearchResponse } from '@/lib/api/types'
import { requirePermission } from '@/lib/auth/guards'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatDateTime, formatNumber, plural } from '@/lib/format'
import { enumParam, pageParam, perPageParam, splitList } from '@/lib/search/params'
import { cn } from '@/lib/utils'
import {
  ACTIVE_IMPORT_STATUSES,
  importDownloads,
  importQueries,
  useCancelImport,
} from '@/modules/imports/api'
import { formatElapsed } from '@/modules/imports/components/import-format'
import { ImportStatusBadge } from '@/modules/imports/components/import-status'

/** Import detail (SCREENS.md §8.1 "Import detail"). Owner: H2 (Import & Master data). */
const searchSchema = z.object({
  severity: enumParam(['error', 'warning']),
  code: z
    .union([z.array(z.string()), z.string()])
    .transform((raw) => {
      const list = splitList(raw)
      return list.length ? list : undefined
    })
    .optional()
    .catch(undefined),
  page: pageParam(),
  perPage: perPageParam(50),
})

export const Route = createFileRoute('/_app/data/imports/$importId')({
  validateSearch: searchSchema,
  beforeLoad: requirePermission('imports.read'),
  staticData: { title: 'Import' },
  component: ImportDetailPage,
})

const POST_PROCESS_TEXT: [keyof ImportJobDetail['postProcess'], string, string][] = [
  ['leaseReturnsLinked', 'lease return linked', 'lease returns linked'],
  ['hardwareHold', 'moved to hardware unavailable', 'moved to hardware unavailable'],
  ['cancelledByItsm', 'cancelled in ITSM', 'cancelled in ITSM'],
  ['probablyClosed', 'lease return marked probably closed', 'lease returns marked probably closed'],
  ['reopened', 'lease return reopened', 'lease returns reopened'],
  ['contactsCreated', 'contact created', 'contacts created'],
  ['contactsUpdated', 'contact updated', 'contacts updated'],
]

export function postProcessSummary(post: ImportJobDetail['postProcess']): string | null {
  const parts = POST_PROCESS_TEXT.filter(([key]) => post[key] > 0).map(
    ([key, one, many]) => `${formatNumber(post[key])} ${post[key] === 1 ? one : many}`,
  )
  return parts.length ? parts.join(' · ') : null
}

function ImportDetailPage() {
  const { importId } = Route.useParams()
  const id = Number(importId)
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const enums = useEnums()
  const patch = (p: Record<string, unknown>) =>
    void navigate({ search: (prev) => ({ ...prev, ...p }) })
  const detail = useQuery(importQueries.detail(id))
  const job = detail.data
  const running = job ? ACTIVE_IMPORT_STATUSES.has(job.status) : false
  const live = useQuery({ ...coreQueries.job(job?.jobId ?? 0), enabled: running })
  const issues = useQuery(
    importQueries.errors(id, {
      severity: search.severity,
      code: search.code,
      page: search.page,
      perPage: search.perPage,
    }),
  )
  const cancel = useCancelImport()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const drawer = useDrawerNavigation()

  const openKey = async (key: string) => {
    const result = await api.get<SearchResponse>('/search', { query: { q: key, limit: 5 } })
    const hit = result.exact
    if (!hit?.id) return
    if (hit.kind === 'service_request') drawer.open('sr', hit.id)
    else if (hit.kind === 'lease_return') drawer.open('lr', hit.id)
    else if (hit.kind === 'asset') drawer.open('asset', hit.id)
  }

  if (detail.isPending) {
    return (
      <Page>
        <PageHeader title="Import" />
        <div className="grid gap-3 px-4">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Page>
    )
  }
  if (detail.error || !job) {
    return (
      <Page>
        <PageHeader title="Import" />
        <EmptyState
          icon={CircleAlert}
          title="This import could not be loaded."
          actions={<Button onClick={() => void detail.refetch()}>Retry</Button>}
        >
          It may not exist any more.
        </EmptyState>
      </Page>
    )
  }

  const progressPercent = live.data?.progress.percent ?? job.progressPercent
  const counts =
    running && live.data ? { ...job.counts, processed: live.data.progress.processed } : job.counts
  const summary = postProcessSummary(job.postProcess)
  const typeLabel = enumLabel(enums, 'importType', job.type)

  const columns: DataColumn<ImportRowIssue>[] = [
    {
      id: 'row',
      header: 'Row',
      width: 70,
      align: 'end',
      locked: true,
      cell: (row) => <span className="font-mono">{row.rowNumber}</span>,
    },
    {
      id: 'severity',
      header: 'Severity',
      width: 110,
      cell: (row) =>
        row.severity === 'error' ? (
          <ToneBadge tone="critical" icon={OctagonX}>
            Error
          </ToneBadge>
        ) : (
          <ToneBadge tone="caution" icon={TriangleAlert}>
            Warning
          </ToneBadge>
        ),
    },
    {
      id: 'column',
      header: 'Column',
      width: 220,
      title: (row) => row.columnName,
      cell: (row) => <span className="truncate font-mono text-xs">{row.columnName ?? '—'}</span>,
    },
    {
      id: 'code',
      header: 'Code',
      width: 170,
      cell: (row) => <span className="font-mono text-xs">{row.code}</span>,
    },
    {
      id: 'message',
      header: 'Message',
      width: 420,
      title: (row) => row.message,
      cell: (row) => <span className="truncate">{row.message}</span>,
    },
    {
      id: 'value',
      header: 'Value',
      width: 180,
      title: (row) => row.rawValue,
      cell: (row) => (
        <span className="truncate font-mono text-xs text-fg-2">{row.rawValue ?? ''}</span>
      ),
    },
    {
      id: 'businessKey',
      header: 'Business key',
      width: 140,
      cell: (row) =>
        row.businessKey ? (
          <button
            type="button"
            className="truncate font-mono text-xs text-accent-text hover:underline"
            onClick={(event) => {
              event.stopPropagation()
              void openKey(row.businessKey!)
            }}
          >
            {row.businessKey}
          </button>
        ) : null,
    },
  ]

  return (
    <Page className="overflow-y-auto">
      <div className="px-4 pt-3 max-md:px-3">
        <Link
          to="/data/imports"
          className="inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg"
        >
          <Icon icon={ArrowLeft} size={12} /> Imports
        </Link>
      </div>
      <PageHeader
        title={`Import #${job.id}`}
        meta={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{typeLabel}</span>
            <span aria-hidden>·</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 font-mono text-xs text-accent-text hover:underline"
              onClick={() => void downloadFrom(() => importDownloads.original(job.id))}
              title="Download the original file"
            >
              <Icon icon={FileText} size={12} />
              {job.originalFilename}
            </button>
            <span aria-hidden>·</span>
            <span>
              {job.createdBy.displayName}, {formatDateTime(job.createdAt)}
            </span>
          </span>
        }
        actions={
          <>
            <ImportStatusBadge job={job} variant="wash" />
            {job.dryRun && <FlagBadge>Dry run</FlagBadge>}
            {job.availableActions.includes('cancel') && (
              <Button icon={X} variant="danger" onClick={() => setConfirmCancel(true)}>
                Cancel import
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 px-4 pb-6 max-md:px-3">
        {running && (
          <section aria-label="Progress" className="rounded-sm border border-line bg-surface p-4">
            <ImportProgress
              counts={counts}
              percent={progressPercent}
              elapsed={formatElapsed(job.startedAt ?? job.createdAt, null)}
              status={job.status === 'queued' ? 'Queued' : 'Importing'}
            />
            <p className="mt-2 text-xs text-fg-3">
              The import keeps running if you leave this page.
              {live.data?.message ? ` ${live.data.message}.` : ''}
            </p>
          </section>
        )}

        {job.jobLevelWarnings.map((warning) => (
          <Banner
            key={warning.code}
            tone={warning.code === 'import_failed' ? 'critical' : 'caution'}
            icon={warning.code === 'import_failed' ? OctagonX : TriangleAlert}
            title={warning.code === 'import_failed' ? 'The import failed' : 'File warning'}
          >
            {warning.message}
          </Banner>
        ))}

        {!running && (
          <section aria-label="Result" className="grid gap-2">
            <div className="rounded-sm border border-line bg-surface">
              <KpiStrip>
                <StatTile label="Created" value={formatNumber(job.counts.created)} />
                <StatTile label="Updated" value={formatNumber(job.counts.updated)} />
                <StatTile label="Unchanged" value={formatNumber(job.counts.unchanged)} />
                <StatTile label="Skipped" value={formatNumber(job.counts.skipped)} />
                <StatTile
                  label="Rows with errors"
                  value={formatNumber(job.counts.errors)}
                  alert={job.counts.errors ? 'critical' : undefined}
                  context={job.counts.errors ? 'not imported' : undefined}
                />
                <StatTile
                  label="Rows with warnings"
                  value={formatNumber(job.counts.warnings)}
                  alert={job.counts.warnings ? 'caution' : undefined}
                  context={job.counts.warnings ? 'imported' : undefined}
                />
              </KpiStrip>
            </div>
            <p className="text-sm text-fg-2">
              {formatNumber(job.counts.processed)} of {formatNumber(job.counts.total)} rows
              processed
              {job.startedAt ? ` in ${formatElapsed(job.startedAt, job.finishedAt)}` : ''}
              {job.dryRun ? ' · dry run, nothing was changed' : ''}
              {summary ? ` · ${summary}` : ''}
              {job.options.targetLocation
                ? ` · received into ${job.options.targetLocation.name}`
                : ''}
              {job.options.markMissingAsProbablyClosed ? ' · missing lease returns marked' : ''}
            </p>
          </section>
        )}

        <section aria-labelledby="issues-title" className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="issues-title" className="text-md font-semibold">
              Issues
            </h2>
            <SegmentedControl<'all' | 'error' | 'warning'>
              label="Severity"
              value={search.severity ?? 'all'}
              onValueChange={(value) =>
                patch({ severity: value === 'all' ? undefined : value, page: undefined })
              }
              options={[
                { value: 'all', label: 'All' },
                { value: 'error', label: 'Errors' },
                { value: 'warning', label: 'Warnings' },
              ]}
            />
            {job.topErrorCodes.map((top) => {
              const active = search.code?.includes(top.code) ?? false
              return (
                <button
                  key={`${top.code}-${top.severity}`}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    patch({
                      code: active
                        ? (search.code ?? []).filter((c) => c !== top.code)
                        : [...(search.code ?? []), top.code],
                      page: undefined,
                    })
                  }
                  className={cn(
                    `hg-tone-${top.severity === 'error' ? 'critical' : 'caution'} inline-flex h-badge items-center gap-1 rounded-xs px-1.5 font-mono text-xs`,
                    active
                      ? 'bg-(--t-wash) text-(--t-fg) shadow-[inset_0_0_0_1px_var(--t)]'
                      : 'text-fg-2 shadow-[inset_0_0_0_1px_var(--hg-line)] hover:bg-hover',
                  )}
                >
                  {top.code}
                  <span className="text-fg-3">{top.count}</span>
                </button>
              )
            })}
            {job.hasErrorReport && (
              <Button
                size="sm"
                icon={Download}
                className="ml-auto"
                onClick={() => void downloadFrom(() => importDownloads.errorReport(job.id))}
              >
                Download error report
              </Button>
            )}
          </div>
          <div className="flex h-[480px] min-h-0 flex-col rounded-sm border border-line">
            <DataTable
              label="Import issues"
              columns={columns}
              rows={issues.data?.data ?? []}
              getRowId={(row) => String(row.id)}
              total={issues.data?.meta.total}
              loading={issues.isPending}
              fetching={issues.isPlaceholderData}
              error={issues.error}
              onRetry={() => void issues.refetch()}
              pagination={{
                page: search.page,
                perPage: search.perPage,
                total: issues.data?.meta.total ?? 0,
                onPageChange: (page) => patch({ page }),
                onPerPageChange: (perPage) => patch({ perPage, page: 1 }),
              }}
              mobileRow={(row) => (
                <div className="grid gap-0.5">
                  <span className="flex items-center gap-2 text-xs">
                    <span className="font-mono">Row {row.rowNumber}</span>
                    <span
                      className={
                        row.severity === 'error' ? 'text-tone-critical-fg' : 'text-tone-caution-fg'
                      }
                    >
                      {row.code}
                    </span>
                  </span>
                  <span className="text-sm">{row.message}</span>
                </div>
              )}
              empty={
                <EmptyState
                  icon={running ? FileText : CircleAlert}
                  title={
                    running ? 'Issues appear while rows are processed.' : 'No errors or warnings.'
                  }
                />
              }
            />
          </div>
          {job.counts.errors > 0 && !running && (
            <p className="text-xs text-fg-3">
              {plural(job.counts.errors, 'row')} with errors were not imported. Fix them in the
              report and upload the corrected rows again.
            </p>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Cancel import #${job.id}?`}
        description={
          job.status === 'queued'
            ? 'The import has not started; nothing will be imported.'
            : 'Rows already processed stay imported; the rest of the file is skipped.'
        }
        confirmLabel="Cancel import"
        cancelLabel="Keep running"
        destructive
        pending={cancel.isPending}
        onConfirm={async () => {
          await cancel.mutateAsync(job.id)
          setConfirmCancel(false)
        }}
      />
    </Page>
  )
}
