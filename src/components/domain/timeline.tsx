import type { ReactNode } from 'react'
import type { Tone } from '@/lib/api/types'
import { formatFullDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface TimelineEvent {
  id: string
  /** Title, IDs in mono (pass JSX with `<IdInk>`). */
  title: ReactNode
  /** Actor · source (e.g. "Dana Dispatcher", "Daily dispatch job"). */
  actor?: ReactNode
  occurredAt: string
  tone?: Tone | null
  body?: ReactNode
  /** Events with the same non-empty key that follow each other collapse ("3 reminders sent"). */
  groupKey?: string
}

/**
 * Timeline (DESIGN.md §10): vertical `<ol>`, 12 px ring dot in the event's tone, 2 px connector,
 * title (13/500) and meta (actor · source · time). Newest first. Runs of identical system
 * events collapse into one row with a count.
 */
export function Timeline({
  events,
  collapseLabel = (count, first) => (
    <>
      {first.title} ×{count}
    </>
  ),
  empty = 'No history yet.',
}: {
  events: readonly TimelineEvent[]
  collapseLabel?: (count: number, first: TimelineEvent) => ReactNode
  empty?: ReactNode
}) {
  if (events.length === 0) return <p className="text-sm text-fg-3">{empty}</p>
  const rows: { event: TimelineEvent; count: number }[] = []
  for (const event of events) {
    const last = rows.at(-1)
    if (last && event.groupKey && last.event.groupKey === event.groupKey) last.count++
    else rows.push({ event, count: 1 })
  }
  return (
    <ol className="grid">
      {rows.map(({ event, count }, index) => (
        <li key={event.id} className="relative grid grid-cols-[12px_1fr] gap-2.5 pb-3.5">
          {index < rows.length - 1 && (
            <span aria-hidden className="absolute top-3.5 bottom-0 left-[5px] w-0.5 bg-line" />
          )}
          <span
            aria-hidden
            className={cn(
              'mt-1 size-3 rounded-full bg-raised',
              `hg-tone-${event.tone ?? 'intake'} shadow-[inset_0_0_0_3px_var(--t)]`,
            )}
          />
          <div className="min-w-0">
            <p className="font-medium">{count > 1 ? collapseLabel(count, event) : event.title}</p>
            <p className="text-xs text-fg-3">
              {event.actor && <>{event.actor} · </>}
              <time dateTime={event.occurredAt}>{formatFullDateTime(event.occurredAt)}</time>
            </p>
            {event.body && <div className="mt-1 text-sm text-fg-2">{event.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}
