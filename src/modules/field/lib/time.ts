import { getBusinessTimeZone, toBusinessDate } from '@/lib/format'

/** Business-time helpers of the field module (shared by the screens and the mock API). */

const pad = (n: number) => String(n).padStart(2, '0')

/** UTC ISO timestamp of a business-local wall-clock time (business TZ from /meta/config). */
export function businessInstant(date: string, hour: number, minute = 0): string {
  const guess = Date.parse(`${date}T${pad(hour)}:${pad(minute)}:00Z`)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: getBusinessTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(guess))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return new Date(guess - (local - guess)).toISOString()
}

/** `[start, end)` of a business day as ISO strings. */
export function dayBounds(date: string): [string, string] {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return [businessInstant(date, 0), businessInstant(next.toISOString().slice(0, 10), 0)]
}

export function onBusinessDay(iso: string | null | undefined, date: string): boolean {
  return typeof iso === 'string' && toBusinessDate(iso) === date
}

/** Monday of the week of a business date. */
export function weekMonday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - (day - 1))
  return d.toISOString().slice(0, 10)
}

/** D0: today if Mon–Fri, else next Monday (SPEC_RESOLUTIONS #47). */
export function anchorDay(today: string): string {
  const d = new Date(`${today}T00:00:00Z`)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
