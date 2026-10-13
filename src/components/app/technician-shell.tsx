import { ChevronLeft, ChevronRight, Truck } from 'lucide-react'
import type { ReactNode } from 'react'
import { IconButton } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { addWorkingDays, businessToday, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Mobile technician frame for My tour (DESIGN.md §9.4, SCREENS.md §6.2) — 390 px first:
 * 56 px header with the date stepper ("‹ Today, 13 Oct ›"), tour code and van icon, a summary
 * line, the scrolling stop list (`children`), and an optional sticky footer (e.g. the
 * deployment's Complete / Reschedule bar). H4 fills it with the tour data.
 */
export function TechnicianShell({
  date,
  onDateChange,
  tourCode,
  summary,
  status,
  children,
  footer,
  className,
}: {
  /** Business date shown (`YYYY-MM-DD`). */
  date: string
  onDateChange: (date: string) => void
  tourCode?: string | null
  /** "6 stops · 5 devices · 38 km" */
  summary?: ReactNode
  /** Sync / offline indicator on the right. */
  status?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const today = businessToday()
  const label = date === today ? `Today, ${formatDate(date, { weekday: false })}` : formatDate(date)
  return (
    <div className={cn('mx-auto flex h-full w-full max-w-[640px] flex-col bg-canvas', className)}>
      <header className="sticky top-0 z-10 grid gap-0.5 border-b border-line bg-surface px-2 pt-1.5 pb-2">
        <div className="flex h-14 items-center gap-1">
          <IconButton
            icon={ChevronLeft}
            label="Previous working day"
            size="touch"
            onClick={() => onDateChange(addWorkingDays(date, -1))}
          />
          <span className="flex-1 text-center text-lg font-semibold">{label}</span>
          <IconButton
            icon={ChevronRight}
            label="Next working day"
            size="touch"
            onClick={() => onDateChange(addWorkingDays(date, 1))}
          />
          {tourCode && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-xs px-1.5 font-mono text-sm text-fg-2 shadow-[inset_0_0_0_1px_var(--hg-line)]">
              <Icon icon={Truck} size={14} /> {tourCode}
            </span>
          )}
        </div>
        {(summary ?? status) && (
          <div className="flex items-center justify-between gap-2 px-2 text-xs text-fg-3">
            <span>{summary}</span>
            {status}
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && (
        <div className="sticky bottom-0 grid grid-flow-col gap-2 border-t border-line bg-raised p-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-bar">
          {footer}
        </div>
      )}
    </div>
  )
}

/**
 * One station of the vertical Line (stop list): time, person, details; `now` gets the amber
 * ring and the expanded body.
 */
export function TourStation({
  time,
  title,
  meta,
  state,
  children,
}: {
  time: string
  title: ReactNode
  meta?: ReactNode
  state: 'done' | 'now' | 'next'
  children?: ReactNode
}) {
  return (
    <li className="relative grid grid-cols-[20px_1fr] gap-3 px-4 pb-4">
      <span aria-hidden className="absolute top-5 bottom-0 left-[25px] w-0.5 bg-line" />
      <span
        aria-hidden
        className={cn(
          'relative mt-1 size-3 justify-self-center rounded-full',
          state === 'done' && 'bg-fg-3',
          state === 'now' &&
            'bg-tone-booked shadow-[0_0_0_2px_var(--hg-canvas),0_0_0_4px_var(--hg-accent-line)]',
          state === 'next' && 'bg-canvas shadow-[inset_0_0_0_2px_var(--hg-line-strong)]',
        )}
      />
      <div className="grid gap-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm text-fg-2">{time}</span>
          <span className="font-semibold">{title}</span>
          {state === 'now' && (
            <span className="ml-auto text-2xs font-semibold text-accent-text">Now</span>
          )}
        </div>
        {meta && <div className="text-xs text-fg-3">{meta}</div>}
        {children}
      </div>
    </li>
  )
}
