import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { MoreHorizontal, Table2 } from 'lucide-react'
import { ColumnHeader, PipelineColumn } from '@/components/domain/pipeline-board'
import { Button, IconButton } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/feedback'
import type { PipelineStage, ServiceRequestStatus, Tone } from '@/lib/api/types'
import { addDays, businessToday, formatNumber, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { apiQuery, srListQuery, type PipelineSummaryExt } from '@/modules/requests/api'
import type { PipelineSearch } from '@/modules/requests/search'
import { useNow } from '@/lib/use-now'
import { SrCard } from './sr-card'

/** Station tone per stage (the Line, DESIGN.md §1/§3.1). */
export const STAGE_TONES: Record<PipelineStage, Tone> = {
  imported: 'intake',
  invited: 'outreach',
  booked: 'booked',
  personalizing: 'workshop',
  ready: 'workshop',
  delivery: 'transit',
  deployed: 'done',
  closed: 'intake',
}

const PAGE = 50
const CLOSED_STAGES = new Set<PipelineStage>(['deployed', 'closed'])

export type StageSummary = PipelineSummaryExt['stages'][number]

/** Board scope (filters) shared by every column's card query. */
export function columnQuery(
  search: PipelineSearch,
  stage: PipelineStage,
  statuses: readonly ServiceRequestStatus[],
  limit: number,
) {
  const closed = CLOSED_STAGES.has(stage)
  return apiQuery({
    siteId: search.siteId,
    regionId: search.regionId,
    deliveryType: search.deliveryType,
    vip: search.vip,
    campus: search.campus,
    needsAttention: search.needsAttention,
    stage,
    status: statuses.length ? statuses : undefined,
    perPage: limit,
    sort: closed ? '-statusChangedAt' : (search.sort ?? 'appointmentStartAt'),
    includeClosed: closed ? true : undefined,
    closedFrom: closed ? addDays(businessToday(), -14) : undefined,
  })
}

export function StageColumn({
  summary,
  next,
  search,
  first,
  limit,
  onLimit,
  selectedId,
  focusFirst,
  onOpen,
  onToggleStatus,
}: {
  summary: StageSummary
  next: StageSummary | undefined
  search: PipelineSearch
  first?: boolean
  limit: number
  onLimit: (limit: number) => void
  selectedId: number | undefined
  /** The board's first card takes tabIndex 0 (roving tabindex). */
  focusFirst?: boolean
  onOpen: (id: number) => void
  onToggleStatus: (status: ServiceRequestStatus) => void
}) {
  const navigate = useNavigate()
  const now = useNow()
  const stageStatuses = summary.statuses.map((s) => s.status)
  const active = (search.status ?? []).filter((s) => stageStatuses.includes(s))
  const query = useQuery(srListQuery(columnQuery(search, summary.stage, active, limit)))
  const cards = query.data?.data ?? []
  const total = query.data?.meta.total ?? 0
  const visibleStatuses = summary.statuses.filter((s) => s.count > 0)
  const label = `${summary.label}, ${plural(summary.count, 'request')}`

  return (
    <PipelineColumn
      label={label}
      className={cn(CLOSED_STAGES.has(summary.stage) && 'bg-[color-mix(in_srgb,var(--hg-canvas)_60%,transparent)]')}
      header={
        <>
          <ColumnHeader
            title={summary.label}
            tone={STAGE_TONES[summary.stage]}
            count={summary.count}
            first={first}
            flow={next && next.enteredLast24h > 0 ? next.enteredLast24h : undefined}
            aging={summary.aging}
            menu={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    icon={MoreHorizontal}
                    label={`${summary.label} column options`}
                    size="sm"
                    className="size-6"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    icon={Table2}
                    onSelect={() =>
                      void navigate({
                        to: '/service-requests',
                        search: apiQuery({
                          ...columnQuery(search, summary.stage, active, 25),
                          perPage: undefined,
                          sort: undefined,
                        }) as never,
                      })
                    }
                  >
                    Open as table
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
          {visibleStatuses.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1" aria-label={`${summary.label} statuses`}>
              {visibleStatuses.map((status) => {
                const pressed = active.includes(status.status)
                return (
                  <button
                    key={status.status}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => onToggleStatus(status.status)}
                    title={`${status.label}: ${status.count}${status.attentionCount ? ` · ${status.attentionCount} need attention` : ''}`}
                    className={cn(
                      `hg-tone-${status.tone} inline-flex h-[18px] items-center gap-1 rounded-xs px-1.5 text-[11px] text-fg-2 shadow-[inset_0_0_0_1px_var(--hg-line)] hover:text-fg`,
                      pressed && 'bg-(--t-wash) text-(--t-fg) shadow-[inset_0_0_0_1px_var(--t)]',
                    )}
                  >
                    <span className="max-w-[92px] truncate">{status.label}</span>
                    <span className="font-mono">{status.count}</span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      }
    >
      {query.isPending ? (
        [0, 1, 2].map((i) => <Skeleton key={i} className="h-[92px] rounded-sm" />)
      ) : query.isError ? (
        <div className="grid gap-2 p-2 text-xs text-fg-3">
          Could not load this column.
          <Button size="sm" variant="secondary" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : cards.length === 0 ? (
        <p className="px-1 py-3 text-xs text-fg-3">Nothing here.</p>
      ) : (
        <>
          {cards.map((sr, index) => (
            <SrCard
              key={sr.id}
              sr={sr}
              now={now}
              selected={selectedId === sr.id}
              initialFocus={focusFirst && index === 0}
              onOpen={() => onOpen(sr.id)}
            />
          ))}
          {total > cards.length && (
            <Button
              size="sm"
              variant="ghost"
              loading={query.isFetching}
              onClick={() => onLimit(Math.min(200, limit + PAGE))}
              disabled={limit >= 200}
            >
              {limit >= 200
                ? `${formatNumber(total - cards.length)} more in the table`
                : `Load more · ${formatNumber(total - cards.length)} left`}
            </Button>
          )}
        </>
      )}
    </PipelineColumn>
  )
}

export const COLUMN_PAGE = PAGE
