import { Calendar, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  addDays,
  addWorkingDays,
  businessToday,
  formatDate,
  isoWeekday,
  isWorkingDay,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import { Icon } from './icon'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

/**
 * DatePicker (DESIGN.md §10): popover with presets first (Today, Tomorrow, Next working day,
 * This week, Next week), then a Mon-first calendar grid with ISO weeks, today outlined,
 * weekends muted. Typed input accepts `16.10`, `16 Oct`, `2026-10-16`, `+3d`, `today`.
 * Keyboard: arrows move days, PgUp/PgDn months, Home/End week, Enter selects, `T` today.
 * Values are business dates `YYYY-MM-DD`. `range` mode for filters.
 */

export interface DateRange {
  from: string | undefined
  to: string | undefined
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Parse what people type: `16.10`, `16.10.2026`, `16 Oct`, `2026-10-16`, `+3d`, `-1d`, `today`. */
export function parseTypedDate(text: string, today = businessToday()): string | undefined {
  const value = text.trim().toLowerCase()
  if (!value) return undefined
  if (value === 'today' || value === 't') return today
  if (value === 'tomorrow') return addDays(today, 1)
  const rel = /^([+-])\s*(\d{1,3})\s*(d|w)?$/.exec(value)
  if (rel) {
    const n = Number(rel[2]) * (rel[3] === 'w' ? 7 : 1)
    return addDays(today, rel[1] === '-' ? -n : n)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const year = Number(today.slice(0, 4))
  const dotted = /^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/.exec(value)
  if (dotted) {
    const y = dotted[3] ? Number(dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3]) : year
    return valid(y, Number(dotted[2]), Number(dotted[1]))
  }
  const named = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s*(\d{4})?$/.exec(value)
  if (named) {
    const month = MONTHS.findIndex((m) => m.toLowerCase() === named[2]) + 1
    if (month === 0) return undefined
    return valid(named[3] ? Number(named[3]) : year, month, Number(named[1]))
  }
  return undefined
}

function valid(y: number, m: number, d: number): string | undefined {
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return undefined
  }
  return `${y}-${pad(m)}-${pad(d)}`
}

function startOfIsoWeek(date: string): string {
  return addDays(date, 1 - isoWeekday(date))
}

function isoWeekNumber(date: string): number {
  const d = new Date(`${date}T00:00:00Z`)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

function monthGrid(month: string): string[][] {
  const first = `${month}-01`
  const start = startOfIsoWeek(first)
  const weeks: string[][] = []
  for (let w = 0; w < 6; w++) {
    weeks.push(Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)))
  }
  return weeks
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const date = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`
}

interface Preset {
  label: string
  range: DateRange
}

function presets(today: string, range: boolean): Preset[] {
  const weekStart = startOfIsoWeek(today)
  const single = (label: string, date: string): Preset => ({
    label,
    range: { from: date, to: date },
  })
  const list: Preset[] = [
    single('Today', today),
    single('Tomorrow', addDays(today, 1)),
    single('Next working day', addWorkingDays(today, 1)),
  ]
  if (range) {
    list.push(
      { label: 'This week', range: { from: weekStart, to: addDays(weekStart, 6) } },
      { label: 'Next week', range: { from: addDays(weekStart, 7), to: addDays(weekStart, 13) } },
      { label: 'Next 7 days', range: { from: today, to: addDays(today, 7) } },
    )
  } else {
    list.push(
      single('This week (Fri)', addDays(weekStart, 4)),
      single('Next week (Mon)', addDays(weekStart, 7)),
    )
  }
  return list
}

interface CalendarProps {
  value: DateRange
  onSelect: (date: string) => void
  today: string
}

function CalendarGrid({ value, onSelect, today }: CalendarProps) {
  const [focused, setFocused] = useState(value.from ?? today)
  const [month, setMonth] = useState(focused.slice(0, 7))
  const gridRef = useRef<HTMLTableElement>(null)
  const weeks = useMemo(() => monthGrid(month), [month])

  const move = (date: string) => {
    setFocused(date)
    setMonth(date.slice(0, 7))
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)?.focus()
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const keys: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => startOfIsoWeek(focused),
      End: () => addDays(startOfIsoWeek(focused), 6),
      PageUp: () => `${shiftMonth(focused.slice(0, 7), -1)}-${focused.slice(8)}`,
      PageDown: () => `${shiftMonth(focused.slice(0, 7), 1)}-${focused.slice(8)}`,
      t: () => today,
      T: () => today,
    }
    const next = keys[event.key]
    if (next) {
      event.preventDefault()
      const target = next()
      move(
        valid(Number(target.slice(0, 4)), Number(target.slice(5, 7)), Number(target.slice(8))) ??
          `${target.slice(0, 7)}-28`,
      )
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(focused)
    }
  }

  const inRange = (date: string) =>
    value.from !== undefined && value.to !== undefined && date >= value.from && date <= value.to
  const [y, m] = month.split('-').map(Number) as [number, number]

  return (
    <div className="grid gap-2 p-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setMonth(shiftMonth(month, -1))}
          className="grid size-7 place-items-center rounded-sm text-fg-2 hover:bg-hover"
        >
          <Icon icon={ChevronLeft} />
        </button>
        <span className="font-medium" aria-live="polite">
          {MONTHS[m - 1]} {y}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setMonth(shiftMonth(month, 1))}
          className="grid size-7 place-items-center rounded-sm text-fg-2 hover:bg-hover"
        >
          <Icon icon={ChevronRight} />
        </button>
      </div>
      <table ref={gridRef} role="grid" className="border-collapse text-xs" onKeyDown={onKeyDown}>
        <thead>
          <tr>
            <th scope="col" className="w-7 pb-1 text-center font-medium text-fg-3">
              <abbr title="ISO week">Wk</abbr>
            </th>
            {WEEKDAYS.map((day) => (
              <th key={day} scope="col" className="w-8 pb-1 text-center font-medium text-fg-3">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              <td className="text-center font-mono text-2xs text-fg-3">
                {isoWeekNumber(week[0] ?? '')}
              </td>
              {week.map((date) => {
                const outside = date.slice(0, 7) !== month
                const selected = date === value.from || date === value.to
                return (
                  <td key={date} role="gridcell" aria-selected={selected} className="p-px">
                    <button
                      type="button"
                      data-date={date}
                      tabIndex={date === focused ? 0 : -1}
                      aria-label={formatDate(date, { weekday: true, year: true })}
                      aria-current={date === today ? 'date' : undefined}
                      onClick={() => onSelect(date)}
                      className={cn(
                        'grid h-7 w-8 place-items-center rounded-xs tabular-nums',
                        'hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus',
                        !isWorkingDay(date) && 'text-fg-3',
                        outside && 'text-fg-disabled',
                        inRange(date) && 'bg-accent-wash',
                        date === today && 'shadow-[inset_0_0_0_1px_var(--hg-line-strong)]',
                        selected &&
                          'bg-accent font-semibold text-fg-on-accent hover:bg-accent-hover',
                      )}
                    >
                      {Number(date.slice(8))}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function useToday(): string {
  return useMemo(() => businessToday(), [])
}

interface PickerPanelProps {
  value: DateRange
  range: boolean
  onChange: (range: DateRange) => void
  onDone: () => void
}

function PickerPanel({ value, range, onChange, onDone }: PickerPanelProps) {
  const today = useToday()
  const [typed, setTyped] = useState('')
  const [pendingFrom, setPendingFrom] = useState<string | undefined>(undefined)
  const presetList = presets(today, range)

  const selectDay = (date: string) => {
    if (!range) {
      onChange({ from: date, to: date })
      onDone()
      return
    }
    if (!pendingFrom) {
      setPendingFrom(date)
      onChange({ from: date, to: undefined })
    } else {
      const [from, to] = date < pendingFrom ? [date, pendingFrom] : [pendingFrom, date]
      setPendingFrom(undefined)
      onChange({ from, to })
      onDone()
    }
  }

  return (
    <div className="grid w-[300px] gap-1">
      <input
        aria-label="Type a date"
        placeholder="Type a date: 16.10, 16 Oct, +3d"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          const parsed = parseTypedDate(typed, today)
          if (parsed) selectDay(parsed)
        }}
        className="h-8 rounded-sm border border-line-strong bg-sunken px-2 text-sm outline-none focus:border-focus"
      />
      <ul className="grid">
        {presetList.map((preset) => {
          const active = preset.range.from === value.from && preset.range.to === value.to
          return (
            <li key={preset.label}>
              <button
                type="button"
                onClick={() => {
                  onChange(preset.range)
                  onDone()
                }}
                className="flex h-[30px] w-full items-center gap-2 rounded-xs px-2 text-left hover:bg-hover"
              >
                <span className="grid size-4 place-items-center">
                  {active && <Icon icon={Check} size={14} className="text-accent-text" />}
                </span>
                <span className="flex-1">{preset.label}</span>
                <span className="text-xs text-fg-3">
                  {preset.range.from === preset.range.to
                    ? formatDate(preset.range.from)
                    : `${formatDate(preset.range.from)} – ${formatDate(preset.range.to)}`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="border-t border-line-subtle">
        <CalendarGrid value={value} onSelect={selectDay} today={today} />
      </div>
    </div>
  )
}

function triggerClass(className?: string) {
  return cn(
    'inline-flex h-control items-center gap-1.5 rounded-sm border border-line bg-surface pr-2 pl-2 whitespace-nowrap',
    'hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
    className,
  )
}

export function DatePicker({
  value,
  onChange,
  label,
  placeholder = 'Pick a date',
  className,
}: {
  value: string | undefined
  onChange: (date: string | undefined) => void
  label: string
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label={label} className={triggerClass(className)}>
        <Icon icon={Calendar} size={14} className="text-fg-3" />
        <span className={value ? 'text-fg' : 'text-fg-3'}>
          {value ? formatDate(value) : placeholder}
        </span>
      </PopoverTrigger>
      <PopoverContent>
        <PickerPanel
          value={{ from: value, to: value }}
          range={false}
          onChange={(range) => onChange(range.from)}
          onDone={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

export function DateRangePicker({
  value,
  onChange,
  label,
  placeholder = 'Any date',
  className,
  inline,
}: {
  value: DateRange
  onChange: (range: DateRange) => void
  label: string
  placeholder?: string
  className?: string
  /** Render the panel without its own popover (inside the filter bar's "+ Filter"). */
  inline?: boolean
}) {
  const [open, setOpen] = useState(false)
  const panel = (
    <PickerPanel value={value} range onChange={onChange} onDone={() => setOpen(false)} />
  )
  if (inline) return panel
  const text =
    value.from && value.to
      ? value.from === value.to
        ? formatDate(value.from)
        : `${formatDate(value.from)} – ${formatDate(value.to)}`
      : value.from
        ? `from ${formatDate(value.from)}`
        : value.to
          ? `until ${formatDate(value.to)}`
          : placeholder
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label={label} className={triggerClass(className)}>
        <Icon icon={Calendar} size={14} className="text-fg-3" />
        <span className={value.from || value.to ? 'text-fg' : 'text-fg-3'}>{text}</span>
      </PopoverTrigger>
      <PopoverContent>{panel}</PopoverContent>
    </Popover>
  )
}
