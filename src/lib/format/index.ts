/**
 * Display formats (DESIGN.md §4.2, SCREENS.md §0). Dates are shown in the business time zone
 * from `GET /meta/config` (set once by the app shell via `setBusinessTimeZone`).
 *
 *   formatDateTime('2026-10-16T07:30:00Z')  -> "Thu 16 Oct · 09:30"
 *   formatDate('2026-10-16')                -> "Thu 16 Oct"   (year shown outside this year)
 *   formatFullDateTime(iso)                 -> "1 Oct 2026, 08:14"
 *   formatRelative(iso)                     -> "in 2 days" / "3 days ago" / "today"
 *   formatAge(iso)                          -> "4d" / "7h" / "12m"
 *   formatNumber(1284)                      -> "1,284"
 */

let businessTimeZone = 'Europe/Zurich'

export function setBusinessTimeZone(tz: string): void {
  businessTimeZone = tz
  cache.clear()
}

export function getBusinessTimeZone(): string {
  return businessTimeZone
}

const cache = new Map<string, Intl.DateTimeFormat>()

function fmt(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let formatter = cache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', { timeZone: businessTimeZone, ...options })
    cache.set(key, formatter)
  }
  return formatter
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Parse an ISO date (`YYYY-MM-DD`, business date) or timestamp. */
export function toDate(value: string | Date): Date {
  if (value instanceof Date) return value
  // A bare business date: noon UTC keeps it on the same calendar day in every zone we use.
  return ISO_DATE.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value)
}

function parts(value: string | Date, options: Intl.DateTimeFormatOptions, key: string) {
  const out: Record<string, string> = {}
  for (const part of fmt(key, options).formatToParts(toDate(value))) out[part.type] = part.value
  return out
}

/** Business date of a timestamp (or today): `YYYY-MM-DD`. */
export function toBusinessDate(value: string | Date = new Date()): string {
  if (typeof value === 'string' && ISO_DATE.test(value)) return value
  const p = parts(value, { year: 'numeric', month: '2-digit', day: '2-digit' }, 'ymd')
  return `${p.year}-${p.month}-${p.day}`
}

export function businessToday(): string {
  return toBusinessDate(new Date())
}

/** Whole days from `from` to `to` (business dates). */
export function daysBetween(from: string | Date, to: string | Date): number {
  const a = Date.parse(`${toBusinessDate(from)}T00:00:00Z`)
  const b = Date.parse(`${toBusinessDate(to)}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/** `YYYY-MM-DD` + n days. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** ISO weekday 1 (Mon) … 7 (Sun) of a business date. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}

export function isWorkingDay(date: string): boolean {
  return isoWeekday(date) <= 5
}

/** Next (n > 0) or previous (n < 0) working day, Mon–Fri (SPEC §0: no holiday calendar). */
export function addWorkingDays(date: string, n: number): string {
  let current = date
  let remaining = Math.abs(n)
  const step = n >= 0 ? 1 : -1
  while (remaining > 0) {
    current = addDays(current, step)
    if (isWorkingDay(current)) remaining--
  }
  return current
}

function currentYear(): string {
  return parts(new Date(), { year: 'numeric' }, 'y').year ?? ''
}

/** "Thu 16 Oct" (or "16 Oct 2026" with year outside the current year / `year: true`). */
export function formatDate(
  value: string | Date | null | undefined,
  options: { weekday?: boolean; year?: boolean } = {},
): string {
  if (!value) return '—'
  const p = parts(value, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, 'd')
  const showYear = options.year ?? p.year !== currentYear()
  const weekday = options.weekday ?? !showYear
  // en-GB writes "Sept"; DESIGN §4.2 uses three-letter months everywhere
  const month = p.month?.slice(0, 3)
  return [weekday ? p.weekday : null, p.day, month, showYear ? p.year : null]
    .filter(Boolean)
    .join(' ')
}

/** "09:30" (24 h). */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const p = parts(value, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, 't')
  return `${p.hour}:${p.minute}`
}

/** "Thu 16 Oct · 09:30" */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  return `${formatDate(value)} · ${formatTime(value)}`
}

/** "1 Oct 2026, 08:14" (drawer, history). */
export function formatFullDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  return `${formatDate(value, { weekday: false, year: true })}, ${formatTime(value)}`
}

/** "in 2 days" / "3 days ago" / "today" / "yesterday" / "tomorrow" (by business date). */
export function formatRelative(value: string | Date | null | undefined, now = new Date()): string {
  if (!value) return '—'
  const days = daysBetween(now, value)
  if (days === 0) {
    if (typeof value === 'string' && ISO_DATE.test(value)) return 'today'
    const minutes = Math.round((toDate(value).getTime() - now.getTime()) / 60_000)
    if (Math.abs(minutes) < 1) return 'just now'
    if (Math.abs(minutes) < 60) return minutes > 0 ? `in ${minutes} min` : `${-minutes} min ago`
    const hours = Math.round(minutes / 60)
    return hours > 0 ? `in ${hours} h` : `${-hours} h ago`
  }
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${-days} days ago`
}

/** Compact elapsed time since `value`: "4d", "7h", "12m" (DESIGN.md §4.2). */
export function formatAge(value: string | Date | null | undefined, now = new Date()): string {
  if (!value) return '—'
  const minutes = Math.max(0, Math.floor((now.getTime() - toDate(value).getTime()) / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

const numberFormat = new Intl.NumberFormat('en-US')

/** "1,284" */
export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : numberFormat.format(value)
}

/** "87.5%" */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(digits).replace(/\.0+$/, '')}%`
}

/** "12 KB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** "3 reminders", "1 reminder" */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`
}
