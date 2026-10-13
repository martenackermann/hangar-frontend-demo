import type { LocationType, Tone } from '@/lib/api/types'
import { getBusinessTimeZone } from '@/lib/format'
import { db } from '@/mocks/db'
import type { StockLocationRow } from '@/mocks/fixtures/types'
import { servedEnums } from '@/mocks/core/fixture'
import './tables'

/** Shared helpers of the H5 mock API (the MSW twin of `app/modules/h5_stock`). */

export const STOCK_TYPES = new Set<LocationType>(['goods_in', 'staging', 'goods_out'])
export const EXPECTED_TYPES = new Set<LocationType>(['goods_in', 'staging', 'goods_out', 'return'])
export const DEACTIVATED = new Set([
  'deactivated_returned',
  'deactivated_bought_out',
  'deactivated_disposed',
])

const SCAN_TONE: Record<string, Tone> = { ok: 'done', warning: 'caution', error: 'critical' }
export function verdictTone(verdict: string): Tone {
  return SCAN_TONE[verdict] ?? 'intake'
}

/** Enum label from the served `/meta/enums` (the backend's own labels). */
export function label(
  enumKey: 'assetStatus' | 'locationType' | 'deactivationReason',
  value: string,
): string {
  return servedEnums()[enumKey].find((item) => item.value === value)?.label ?? value
}

export function userIdByEmail(email: string): number | null {
  return db.collection('users').find((user) => user.email === email)?.id ?? null
}

export function siteByCode(code: string) {
  return db.collection('sites').find((site) => site.code === code)
}

export function locationsOfSite(siteId: number, types: ReadonlySet<LocationType> = EXPECTED_TYPES) {
  return db
    .collection('stock_locations')
    .filter((location) => location.siteId === siteId && types.has(location.type))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
}

export function locationMap(): Map<number, StockLocationRow> {
  return new Map(
    db
      .collection('stock_locations')
      .all()
      .map((l) => [l.id, l]),
  )
}

function tzOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour') % 24,
    value('minute'),
    value('second'),
  )
  return Math.round((asUtc - date.getTime()) / 60_000)
}

/** Business-local wall clock on `day` → ISO UTC (`ctx.at(day, hour)` of the backend seed). */
export function businessDateTime(day: string, hour = 0, minute = 0): string {
  const [y, m, d] = day.split('-').map(Number)
  const guess = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, hour, minute)
  const offset = tzOffsetMinutes(new Date(guess), getBusinessTimeZone())
  return new Date(guess - offset * 60_000).toISOString()
}

export function compact(date: string): string {
  return date.replaceAll('-', '')
}

/** "13 Oct 2026" for documents and CSV cells (en-GB, business TZ). */
export function docDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: getBusinessTimeZone(),
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function docDateTime(value: string | null | undefined): string {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: getBusinessTimeZone(),
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value))
}

export function normalizeSerial(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().toUpperCase()
  return cleaned || null
}

const PLACE = /^[A-Z]{1,2}[0-9]{1,2}-[0-9]{1,3}$/
export function normalizePlace(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  let cleaned = value.trim().toUpperCase()
  if (cleaned.startsWith('LOC:')) cleaned = cleaned.slice(4).trim()
  return PLACE.test(cleaned) ? cleaned : null
}

/** Trimmed text or null for blank input (form fields). */
export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}
