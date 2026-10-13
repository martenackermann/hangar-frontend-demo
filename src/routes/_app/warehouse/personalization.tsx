import { useQuery } from '@tanstack/react-query'
import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { Inbox } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { z } from 'zod'
import { FilterBar, type FilterDef } from '@/components/data-table/filter-bar'
import { StatusBadge } from '@/components/domain/status'
import { DrawerError } from '@/components/drawer/drawer-states'
import { Avatar, EmptyState, SkeletonRows } from '@/components/ui/feedback'
import { Page, PageHeader } from '@/components/ui/page'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Tooltip } from '@/components/ui/tooltip'
import { useHubs, useRegions } from '@/lib/api/core'
import type { PersonalizationQueueItem } from '@/lib/api/types'
import { requirePermission } from '@/lib/auth/guards'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatNumber } from '@/lib/format'
import {
  dateParam,
  enumParam,
  idListParam,
  idParam,
  listParam,
  stringParam,
} from '@/lib/search/params'
import { useShortcut } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { stagingQueries } from '@/modules/staging/api'
import { Appointment } from '@/modules/staging/components/appointment'
import { HubSelect } from '@/modules/staging/components/hub-select'
import {
  EmptyPanel,
  PersonalizationPanel,
} from '@/modules/staging/components/personalization-panel'
import { useHubId } from '@/modules/staging/hooks/use-hub'

/**
 * Personalization (SCREENS.md §5.2): queue in appointment order (left) + work panel (right).
 * The selected request lives in `?selected=` — `?sr=` is the global SR drawer of the shell.
 */
const QUEUES = ['unclaimed', 'mine', 'all'] as const
const PROCUREMENT = ['replacement', 'new_hire', 'additional_device', 'removal'] as const

const searchSchema = z.object({
  siteId: idParam(),
  queue: enumParam(QUEUES),
  regionId: idListParam({ allowNone: true }),
  procurementType: listParam(PROCUREMENT),
  appointmentFrom: dateParam(),
  appointmentTo: dateParam(),
  q: stringParam(),
  selected: idParam(),
})
type Search = z.infer<typeof searchSchema>

export const Route = createFileRoute('/_app/warehouse/personalization')({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams({ queue: 'unclaimed' })] },
  beforeLoad: requirePermission('sr.read'),
  staticData: { title: 'Personalization' },
  component: PersonalizationPage,
})

function queueParams(search: Search, siteId: number | undefined) {
  const queue = search.queue ?? 'unclaimed'
  return {
    siteId,
    status:
      queue === 'unclaimed'
        ? 'appointment_booked'
        : queue === 'all'
          ? 'personalization_in_progress'
          : undefined,
    editorId: queue === 'mine' ? 'me' : undefined,
    regionId: search.regionId,
    procurementType: search.procurementType,
    appointmentFrom: search.appointmentFrom,
    appointmentTo: search.appointmentTo,
    q: search.q,
    perPage: 200,
  }
}

function PersonalizationPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const enums = useEnums()
  const hubs = useHubs()
  const regions = useRegions()
  const siteId = useHubId(search.siteId)
  const site = hubs.find((hub) => hub.id === siteId)
  const queue = search.queue ?? 'unclaimed'
  const query = useQuery({
    ...stagingQueries.personalizationQueue(queueParams(search, siteId)),
    enabled: siteId !== undefined,
  })
  const rows = useMemo(() => query.data?.data ?? [], [query.data])
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
      kind: 'multi',
      key: 'procurementType',
      label: 'Procurement',
      options: PROCUREMENT.map((value) => ({
        value,
        label: enumLabel(enums, 'procurementType', value),
      })),
    },
    {
      kind: 'dateRange',
      id: 'appointment',
      label: 'Appointment',
      fromKey: 'appointmentFrom',
      toKey: 'appointmentTo',
    },
  ]

  const index = rows.findIndex((row) => row.id === search.selected)
  const move = (step: number) => {
    if (rows.length === 0) return
    const next = rows[Math.min(rows.length - 1, Math.max(0, index + step))]
    if (next) patch({ selected: next.id })
  }
  useShortcut('arrowdown', () => move(1), {
    description: 'Next request in the queue',
    group: 'Personalization',
  })
  useShortcut('arrowup', () => move(-1), {
    description: 'Previous request in the queue',
    group: 'Personalization',
  })

  return (
    <Page>
      <PageHeader
        title="Personalization"
        meta={
          site
            ? `${site.name} · ${formatNumber(query.data?.meta.total ?? 0)} in this queue`
            : undefined
        }
        actions={<HubSelect value={siteId} onChange={(next) => patch({ siteId: next })} />}
      />
      <FilterBar
        search={search}
        onSearchChange={(values) => patch(values)}
        filters={filters}
        searchPlaceholder="SR, name, email…"
        resultCount={query.data?.meta.total}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,420px)_minmax(0,1fr)] max-lg:grid-cols-1">
        <section
          aria-label="Queue"
          className="flex min-h-0 flex-col border-r border-line max-lg:border-r-0 max-lg:border-b"
        >
          <div className="border-b border-line px-3 py-2">
            <SegmentedControl
              label="Queue"
              value={queue}
              onValueChange={(value) => patch({ queue: value, selected: undefined })}
              options={[
                { value: 'unclaimed', label: 'Unclaimed' },
                { value: 'mine', label: 'Mine' },
                { value: 'all', label: 'All in progress' },
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {query.isPending ? (
              <SkeletonRows rows={8} widths={[80, 160, 90]} />
            ) : query.isError ? (
              <DrawerError error={query.error} onRetry={() => void query.refetch()} />
            ) : rows.length === 0 ? (
              <EmptyState icon={Inbox} title="No requests waiting for personalization at this hub.">
                Switch the queue tab or hub, or clear the filters.
              </EmptyState>
            ) : (
              <QueueList
                rows={rows}
                selected={search.selected}
                onSelect={(id) => patch({ selected: id })}
              />
            )}
          </div>
        </section>
        <section aria-label="Work panel" className="min-h-0 overflow-y-auto">
          {search.selected ? (
            <PersonalizationPanel key={search.selected} srId={search.selected} />
          ) : (
            <EmptyPanel />
          )}
        </section>
      </div>
    </Page>
  )
}

function QueueList({
  rows,
  selected,
  onSelect,
}: {
  rows: readonly PersonalizationQueueItem[]
  selected: number | undefined
  onSelect: (id: number) => void
}) {
  const activeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  return (
    <ul className="grid" aria-label="Requests">
      {rows.map((row) => {
        const active = row.id === selected
        return (
          <li key={row.id} className="border-b border-line-subtle">
            <button
              ref={active ? activeRef : undefined}
              type="button"
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(row.id)}
              className={cn(
                'grid w-full gap-1 px-3 py-2 text-left hover:bg-hover',
                active && 'bg-accent-wash',
              )}
            >
              <span className="flex items-center gap-2">
                <span className="hg-mono text-sm font-semibold">{row.number}</span>
                <Appointment startAt={row.appointmentStartAt} className="text-xs" />
                <span className="ml-auto flex items-center gap-1.5">
                  {row.editor && <Avatar name={row.editor.displayName} size={18} tone="workshop" />}
                  <StatusBadge entity="serviceRequestStatus" state={row.status} size="sm" />
                </span>
              </span>
              <span className="flex items-center gap-2 text-xs text-fg-2">
                <span className="truncate">{row.contact.displayName}</span>
                {row.region && <span className="text-fg-3">· {row.region.name}</span>}
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-fg-2">
                {row.stockHints.map((hint) => (
                  <Tooltip
                    key={hint.slot}
                    content={
                      hint.availableCount > 0
                        ? `${hint.availableCount} in staging`
                        : 'None in staging'
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      <span
                        aria-hidden
                        className={cn(
                          'size-1.5 rounded-full',
                          hint.availableCount > 0 ? 'bg-tone-done' : 'bg-tone-critical',
                        )}
                      />
                      {hint.article?.internalDescription ??
                        row.items.find((item) => item.slot === hint.slot)?.requestedType}
                      <span className="sr-only">
                        {hint.availableCount > 0
                          ? `, ${hint.availableCount} in staging`
                          : ', none in staging'}
                      </span>
                    </span>
                  </Tooltip>
                ))}
                {row.stockHints.length === 0 && <span className="text-fg-3">No new devices</span>}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
