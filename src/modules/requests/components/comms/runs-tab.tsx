import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { useMemo } from 'react'
import { DataTable, type DataColumn } from '@/components/data-table/data-table'
import { DensityToggle, type SearchPatch } from '@/components/data-table/filter-bar'
import { DrawerFrame } from '@/components/drawer/drawer-frame'
import { DrawerError, DrawerLoading } from '@/components/drawer/drawer-states'
import { StatusBadge } from '@/components/domain/status'
import { EmptyState, FlagBadge } from '@/components/ui/feedback'
import { KeyValue, KeyValues, SectionHeading, Toolbar } from '@/components/ui/page'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { DispatchRun } from '@/lib/api/types'
import { formatDateTime, formatFullDateTime, formatNumber } from '@/lib/format'
import { dispatchRunQuery, dispatchRunsQuery } from '@/modules/requests/api'
import type { CommsSearch } from '@/modules/requests/search'
import { DispatchSummary } from '../dispatch-dialog'
import { useTemplateNames } from '../dispatch-hooks'
import { runTriggerLabel, skipLabel } from '../labels'

function sum(record: Record<string, number>): number {
  return Object.values(record).reduce((total, n) => total + n, 0)
}

function runDuration(run: DispatchRun): string {
  if (!run.finishedAt) return run.status === 'running' || run.status === 'queued' ? 'running' : '—'
  const seconds = Math.max(
    0,
    Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000),
  )
  if (seconds < 60) return `${seconds} s`
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

function breakdown(record: Record<string, number>, label: (key: string) => string): string {
  return Object.entries(record)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => `${label(key)}: ${n}`)
    .join('\n')
}

type DryRunFilter = 'all' | 'real' | 'dry'

export function RunsTab({
  search,
  onSearch,
}: {
  search: CommsSearch
  onSearch: (patch: SearchPatch, replace?: boolean) => void
}) {
  const templateName = useTemplateNames()
  const query = useQuery(
    dispatchRunsQuery({
      page: search.page,
      perPage: search.perPage,
      ...(search.dryRun === undefined ? {} : { dryRun: search.dryRun }),
    }),
  )
  const rows = query.data?.data ?? []
  const filter: DryRunFilter = search.dryRun === undefined ? 'all' : search.dryRun ? 'dry' : 'real'

  const columns = useMemo<DataColumn<DispatchRun>[]>(
    () => [
      {
        id: 'startedAt',
        header: 'Started',
        width: 140,
        locked: true,
        cell: (run) => <span className="whitespace-nowrap">{formatDateTime(run.startedAt)}</span>,
      },
      {
        id: 'trigger',
        header: 'Trigger',
        width: 140,
        title: (run) => run.triggeredBy?.displayName,
        cell: (run) => (
          <span className="truncate">
            {runTriggerLabel(run.trigger)}
            {run.triggeredBy && <span className="text-fg-3"> · {run.triggeredBy.displayName}</span>}
          </span>
        ),
      },
      {
        id: 'dryRun',
        header: 'Dry run',
        width: 84,
        cell: (run) => (run.dryRun ? <FlagBadge>Dry run</FlagBadge> : null),
      },
      {
        id: 'status',
        header: 'Status',
        width: 110,
        cell: (run) => <StatusBadge entity="jobStatus" state={run.status} size="sm" />,
      },
      {
        id: 'mails',
        header: 'Mails',
        width: 80,
        align: 'end',
        title: (run) => breakdown(run.counts, templateName),
        cell: (run) => <span className="font-mono">{formatNumber(sum(run.counts))}</span>,
      },
      {
        id: 'skipped',
        header: 'Skipped',
        width: 90,
        align: 'end',
        title: (run) => breakdown(run.skipped, skipLabel),
        cell: (run) => (
          <span className="font-mono text-fg-2">{formatNumber(sum(run.skipped))}</span>
        ),
      },
      {
        id: 'errors',
        header: 'Errors',
        width: 80,
        align: 'end',
        cell: (run) =>
          run.errors.length > 0 ? (
            <span className="font-mono text-tone-critical-fg">{run.errors.length}</span>
          ) : (
            <span className="font-mono text-fg-3">0</span>
          ),
      },
      {
        id: 'duration',
        header: 'Duration',
        width: 100,
        cell: (run) => <span className="text-fg-2">{runDuration(run)}</span>,
      },
    ],
    [templateName],
  )

  return (
    <>
      <Toolbar end={<DensityToggle />}>
        <SegmentedControl<DryRunFilter>
          label="Run type"
          value={filter}
          onValueChange={(value) =>
            onSearch(
              { dryRun: value === 'all' ? undefined : value === 'dry', page: undefined },
              true,
            )
          }
          options={[
            { value: 'all', label: 'All runs' },
            { value: 'real', label: 'Sent' },
            { value: 'dry', label: 'Dry runs' },
          ]}
        />
        {query.data && (
          <span className="text-xs text-fg-3">{formatNumber(query.data.meta.total)} runs</span>
        )}
      </Toolbar>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <DataTable
          label="Dispatch runs"
          columns={columns}
          rows={rows}
          getRowId={(row: DispatchRun) => String(row.id)}
          total={query.data?.meta.total}
          loading={query.isPending}
          fetching={query.isPlaceholderData}
          error={query.error}
          onRetry={() => void query.refetch()}
          activeId={search.run ? String(search.run) : null}
          onOpen={(row) => onSearch({ run: row.id })}
          mobileRow={(run) => (
            <div className="grid gap-0.5">
              <div className="flex items-center gap-2 text-xs text-fg-3">
                {formatDateTime(run.startedAt)} · {runTriggerLabel(run.trigger)}
                <span className="ml-auto">
                  <StatusBadge entity="jobStatus" state={run.status} size="sm" />
                </span>
              </div>
              <div className="font-medium">
                {formatNumber(sum(run.counts))} mails · {formatNumber(sum(run.skipped))} skipped
                {run.dryRun && <span className="text-fg-3"> · dry run</span>}
              </div>
            </div>
          )}
          pagination={{
            page: search.page,
            perPage: search.perPage,
            total: query.data?.meta.total ?? 0,
            onPageChange: (page) => onSearch({ page }),
            onPerPageChange: (perPage) => onSearch({ perPage, page: undefined }),
          }}
          empty={<EmptyState icon={History} title="No dispatch runs yet." />}
        />
      </div>
    </>
  )
}

/** Run detail drawer (`?run=<id>`): counts, skipped reasons, errors, planned list of dry runs. */
export function RunDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const query = useQuery(dispatchRunQuery(id))
  const run = query.data
  if (query.isError)
    return (
      <DrawerFrame label="Dispatch run" onClose={onClose}>
        <DrawerError error={query.error} onRetry={() => void query.refetch()} />
      </DrawerFrame>
    )
  if (!run)
    return (
      <DrawerFrame label="Dispatch run" onClose={onClose}>
        <DrawerLoading />
      </DrawerFrame>
    )
  return (
    <DrawerFrame
      label={`Dispatch run ${formatFullDateTime(run.startedAt)}`}
      onClose={onClose}
      head={
        <>
          <div className="flex items-center gap-2">
            <h2 className="text-lg leading-6 font-semibold">
              {run.dryRun ? 'Dry run' : 'Dispatch run'} · {formatDateTime(run.startedAt)}
            </h2>
            <span className="ml-auto">
              <StatusBadge entity="jobStatus" state={run.status} variant="wash" />
            </span>
          </div>
          <p className="text-xs text-fg-3">
            {runTriggerLabel(run.trigger)}
            {run.triggeredBy && ` · ${run.triggeredBy.displayName}`} · {runDuration(run)}
          </p>
        </>
      }
    >
      <div className="grid gap-4 px-4 pb-6">
        <DispatchSummary run={run} />
        {!run.dryRun && sum(run.counts) > 0 && (
          <div>
            <SectionHeading>Sent by template</SectionHeading>
            <RunCounts run={run} />
          </div>
        )}
        {run.dryRun && (
          <p className="text-xs text-fg-3">
            Dry runs never send mails. The list shows what a real run would have sent at that
            moment.
          </p>
        )}
      </div>
    </DrawerFrame>
  )
}

function RunCounts({ run }: { run: DispatchRun }) {
  const templateName = useTemplateNames()
  return (
    <KeyValues>
      {Object.entries(run.counts)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([templateId, n]) => (
          <KeyValue key={templateId} label={templateName(templateId)}>
            <span className="font-mono">{formatNumber(n)}</span>
          </KeyValue>
        ))}
    </KeyValues>
  )
}
