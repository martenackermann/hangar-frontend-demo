import type { ReactNode } from 'react'
import type { Readiness, Tone, TourStopOutcome } from '@/lib/api/types'
import { IdInk } from '@/components/domain/status'
import { enumTone, useEnums } from '@/lib/enums'
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const OUTCOME_TONE: Record<TourStopOutcome, Tone> = {
  pending: 'intake',
  completed: 'done',
  rescheduled: 'caution',
  cancelled: 'critical',
}

/**
 * StopChip (DESIGN.md §10 "TourLane / StopChip"): 24 px, time (mono) · SR number (ID ink) ·
 * dot in the readiness / outcome tone. Ready = transit, not yet picked = caution outline,
 * done = done, rescheduled = strikethrough time + caution.
 */
export function StopChip({
  time,
  number,
  readiness,
  outcome,
  onClick,
  className,
}: {
  time: string | null
  number: string
  readiness: Readiness
  outcome: TourStopOutcome
  onClick?: () => void
  className?: string
}) {
  const enums = useEnums()
  const tone: Tone =
    outcome === 'pending'
      ? (enumTone(enums, 'readiness', readiness) ?? 'intake')
      : OUTCOME_TONE[outcome]
  const notPicked = outcome === 'pending' && readiness !== 'ready'
  const content = (
    <>
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-(--t)" />
      <span className={cn('hg-mono text-fg-2', outcome === 'rescheduled' && 'line-through')}>
        {time ? formatTime(time) : '--:--'}
      </span>
      <IdInk value={number} />
    </>
  )
  const classes = cn(
    `hg-tone-${tone} inline-flex h-6 items-center gap-1.5 rounded-xs px-1.5 text-xs`,
    notPicked
      ? 'shadow-[inset_0_0_0_1px_var(--hg-tone-caution)]'
      : 'shadow-[inset_0_0_0_1px_var(--hg-line)]',
    onClick && 'hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus',
    className,
  )
  const label = `${time ? formatTime(time) : 'No time'} ${number}, ${outcome === 'pending' ? readiness.replaceAll('_', ' ') : outcome}`
  return onClick ? (
    <button type="button" className={classes} onClick={onClick} aria-label={label}>
      {content}
    </button>
  ) : (
    <span className={classes} title={label}>
      {content}
    </span>
  )
}

/** Small "count" pill used in the planner grid. */
export function CountPill({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="hg-mono inline-flex h-5 min-w-5 items-center justify-center rounded-xs bg-raised px-1 text-2xs text-fg-2"
    >
      {children}
    </span>
  )
}
