import { ChevronsLeftRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'
import type { PipelineSummaryExt } from '@/modules/requests/api'
import type { StageSummary } from './stage-column'

/**
 * The collapsed Closed column (DESIGN.md §10 PipelineBoard, 136 px): cancelled in the last
 * 14 days, deployed this week, median lead time — and Expand to show the cards.
 */
export function ClosedColumn({
  summary,
  totals,
  onExpand,
}: {
  summary: StageSummary
  totals: PipelineSummaryExt['totals']
  onExpand: () => void
}) {
  return (
    <section
      data-board-column
      aria-label={`${summary.label}, ${summary.count}`}
      className="flex min-w-0 snap-start flex-col"
    >
      <div className="sticky top-0 z-[2] border-b border-line bg-surface px-3 pt-2 pb-2.5">
        <div className="hg-tone-intake relative -mx-3 mb-1.5 h-5" aria-hidden>
          <span className="absolute top-[9px] right-[17px] left-0 h-0.5 bg-line-strong" />
          <span className="absolute top-[5px] left-3 size-2.5 rounded-full bg-(--t) shadow-[0_0_0_3px_var(--hg-surface)]" />
        </div>
        <h2 className="flex h-5 items-center text-xs font-semibold text-fg-2">{summary.label}</h2>
        <div className="mt-0.5 flex items-baseline gap-2 text-xs whitespace-nowrap">
          <span className="text-[22px] leading-7 font-semibold tracking-[-0.012em] [font-stretch:87.5%]">
            {formatNumber(summary.count)}
          </span>
          <span className="text-fg-3">14 days</span>
        </div>
      </div>
      <div className="grid gap-3 p-3">
        <dl className="grid gap-2 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-fg-3">Cancelled 7 d</dt>
            <dd className="font-mono">{formatNumber(totals.cancelledLast7Days)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-fg-3">Deployed 7 d</dt>
            <dd className="font-mono">{formatNumber(totals.completedLast7Days)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-fg-3">Lead time</dt>
            <dd className="font-mono">
              {totals.leadTimeDays === null ? '—' : `${totals.leadTimeDays.toFixed(1)}d`}
            </dd>
          </div>
        </dl>
        <Button size="sm" variant="ghost" icon={ChevronsLeftRight} onClick={onExpand}>
          Expand
        </Button>
      </div>
    </section>
  )
}
