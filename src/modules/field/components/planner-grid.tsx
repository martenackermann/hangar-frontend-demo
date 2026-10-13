import { useRef, useState, type KeyboardEvent } from 'react'
import { StatusBadge } from '@/components/domain/status'
import { Avatar } from '@/components/ui/feedback'
import type { ID, Readiness, TourPlannerOverview, TourSummary } from '@/lib/api/types'
import { useEnums, enumLabel, enumTone } from '@/lib/enums'
import { businessToday, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Week grid of the tour planner (SCREENS.md §6.1): rows = calendars (region routes), columns =
 * working days; a cell shows appointment / planned counts and the tour chip (status tone +
 * technician initials, "Unplanned" when appointments but no tour). Arrow keys move the cell
 * focus, Enter opens the tour editor.
 */
export function PlannerGrid({
  overview,
  selected,
  onSelect,
}: {
  overview: TourPlannerOverview
  selected: { calendarId: ID; date: string } | null
  onSelect: (calendarId: ID, date: string) => void
}) {
  const today = businessToday()
  const [focus, setFocus] = useState<[number, number]>([0, 0])
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const rows = overview.rows
  const days = overview.days

  const move = (event: KeyboardEvent, row: number, col: number) => {
    const delta: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const step = delta[event.key]
    if (!step) return
    event.preventDefault()
    const next: [number, number] = [
      Math.min(rows.length - 1, Math.max(0, row + step[0])),
      Math.min(days.length - 1, Math.max(0, col + step[1])),
    ]
    setFocus(next)
    refs.current.get(`${next[0]}:${next[1]}`)?.focus()
  }

  return (
    <div
      role="grid"
      aria-label="Routes by day"
      className="grid min-w-[760px] rounded-sm border border-line bg-surface"
      style={{ gridTemplateColumns: `180px repeat(${days.length}, minmax(120px, 1fr))` }}
    >
      <div role="row" className="contents">
        <div role="columnheader" className="border-b border-line px-3 py-2 text-xs text-fg-3">
          Route
        </div>
        {days.map((day) => (
          <div
            role="columnheader"
            key={day}
            className={cn(
              'border-b border-l border-line px-3 py-2 text-xs font-semibold',
              day === today ? 'text-accent-text' : 'text-fg-2',
            )}
          >
            {formatDate(day)}
            {day === today && <span className="ml-1 font-normal">· today</span>}
          </div>
        ))}
      </div>
      {rows.map((row, r) => (
        <div role="row" key={row.calendar.id} className="contents">
          <div
            role="rowheader"
            className="grid content-center border-b border-line-subtle px-3 py-2"
          >
            <span className="text-sm font-medium">{row.calendar.name}</span>
            <span className="text-xs text-fg-3">{row.calendar.region?.name ?? 'No region'}</span>
          </div>
          {row.cells.map((cell, c) => {
            const isSelected =
              selected?.calendarId === row.calendar.id && selected.date === cell.date
            const unplanned = !cell.tour && cell.appointmentCount > 0
            return (
              <div role="gridcell" key={cell.date} className="border-b border-l border-line-subtle">
                <button
                  type="button"
                  ref={(node) => {
                    const key = `${r}:${c}`
                    if (node) refs.current.set(key, node)
                    else refs.current.delete(key)
                  }}
                  tabIndex={focus[0] === r && focus[1] === c ? 0 : -1}
                  onFocus={() => setFocus([r, c])}
                  onKeyDown={(event) => move(event, r, c)}
                  onClick={() => onSelect(row.calendar.id, cell.date)}
                  aria-label={`${row.calendar.name}, ${formatDate(cell.date)}: ${cell.appointmentCount} appointments, ${cell.plannedCount} planned${cell.tour ? '' : unplanned ? ', unplanned' : ''}`}
                  aria-pressed={isSelected}
                  className={cn(
                    'grid h-full min-h-16 w-full content-start gap-1 px-2 py-1.5 text-left hover:bg-hover',
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
                    isSelected && 'bg-accent-wash-strong',
                    cell.date === today && !isSelected && 'bg-accent-wash',
                  )}
                >
                  <span className="flex items-center gap-2 text-xs text-fg-3">
                    <span title="Appointments">
                      <span className="hg-mono text-fg">{cell.appointmentCount}</span> appt
                    </span>
                    <span title="Planned stops">
                      <span className="hg-mono text-fg">{cell.plannedCount}</span> planned
                    </span>
                  </span>
                  {cell.tour ? (
                    <span className="flex items-center gap-1.5">
                      <StatusBadge entity="tourStatus" state={cell.tour.status} size="sm" />
                      {cell.tour.technician && (
                        <Avatar name={cell.tour.technician.displayName} size={18} />
                      )}
                    </span>
                  ) : unplanned ? (
                    <span className="hg-tone-caution text-xs font-medium text-(--t-fg)">
                      Unplanned
                    </span>
                  ) : null}
                </button>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** One dot per pending stop, coloured by readiness (StopChip shorthand for lanes). */
function ReadinessDots({ readiness }: { readiness: Record<Readiness, number> }) {
  const enums = useEnums()
  const order: Readiness[] = ['ready', 'to_pick', 'in_staging', 'not_started']
  const dots = order.flatMap((key) =>
    Array.from({ length: readiness[key] }, (_, index) => ({ key: `${key}-${index}`, state: key })),
  )
  return (
    <span className="flex flex-wrap gap-0.5" aria-label="Stops by readiness">
      {dots.slice(0, 12).map((dot) => (
        <span
          key={dot.key}
          title={enumLabel(enums, 'readiness', dot.state)}
          className={`hg-tone-${enumTone(enums, 'readiness', dot.state) ?? 'intake'} size-2 rounded-full bg-(--t)`}
        />
      ))}
      {dots.length > 12 && <span className="text-2xs text-fg-3">+{dots.length - 12}</span>}
    </span>
  )
}

/**
 * Technician lanes (DESIGN.md §10 TourLane): one row per technician, per day the tours they
 * hold as blocks (route, stop count, readiness dots) — the load strip of SCREENS.md §6.1.
 */
export function TechnicianLanes({
  overview,
  tours,
  onOpenTour,
}: {
  overview: TourPlannerOverview
  tours: readonly TourSummary[]
  onOpenTour: (tour: TourSummary) => void
}) {
  const days = overview.days
  return (
    <section aria-label="Technician lanes" className="grid gap-2">
      <h2 className="text-sm font-semibold">Technicians</h2>
      <div
        className="grid min-w-[760px] rounded-sm border border-line bg-surface"
        style={{ gridTemplateColumns: `180px repeat(${days.length}, minmax(120px, 1fr))` }}
      >
        {overview.technicians.map((lane) => {
          const weekStops = lane.days.reduce((sum, d) => sum + d.stopCount, 0)
          return (
            <div key={lane.technician.id} className="contents">
              <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2">
                <Avatar name={lane.technician.displayName} size={22} />
                <span className="grid min-w-0">
                  <span className="truncate text-sm">{lane.technician.displayName}</span>
                  <span className="text-xs text-fg-3">{weekStops} stops this week</span>
                </span>
              </div>
              {days.map((day) => {
                const own = tours.filter(
                  (t) => t.technician?.id === lane.technician.id && t.tourDate === day,
                )
                const load = lane.days.find((d) => d.date === day)
                return (
                  <div
                    key={day}
                    className={cn(
                      'grid content-start gap-1 border-b border-l border-line-subtle p-1.5',
                      (load?.tourCount ?? 0) > 1 &&
                        'shadow-[inset_0_0_0_1px_var(--hg-tone-critical)]',
                    )}
                    title={(load?.tourCount ?? 0) > 1 ? 'Two tours on the same day' : undefined}
                  >
                    {own.map((tour) => (
                      <button
                        type="button"
                        key={tour.id}
                        onClick={() => onOpenTour(tour)}
                        className="grid gap-1 rounded-xs bg-raised px-1.5 py-1 text-left text-xs hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        <span className="flex items-center gap-1">
                          <span className="truncate font-medium">{tour.calendar.name}</span>
                          <span className="hg-mono ml-auto text-fg-3">{tour.stopCount}</span>
                        </span>
                        <ReadinessDots readiness={tour.readiness} />
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </section>
  )
}
