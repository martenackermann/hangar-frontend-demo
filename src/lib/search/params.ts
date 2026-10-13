import { z } from 'zod'

/**
 * URL = state (SCREENS.md §0). The router uses these (de)serializers instead of TanStack's
 * JSON default, so URLs stay readable: `?status=invited,escalated&regionId=1,4&sr=42`.
 *
 * - `parseSearch` keeps every value as the raw string (repeated keys are joined into one comma
 *   list); the route's zod schema coerces it with
 *   the helpers below (`listParam`, `idListParam`, `boolParam`, `dateParam`, `intParam`, ...).
 * - `stringifySearch` writes arrays comma-separated, booleans/numbers as text, drops empty
 *   values, keeps commas readable.
 *
 * Every helper accepts both the raw URL string and the typed value (`navigate({ search })`),
 * never throws (invalid values fall back to `undefined` or the default), and its output is
 * the typed value.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function encodeValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined
    return value.map((item) => encodeValue(item) ?? '').join(',')
  }
  if (typeof value === 'string') return value === '' ? undefined : value
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return JSON.stringify(value)
}

function encodeComponent(text: string): string {
  return encodeURIComponent(text).replace(/%2C/gi, ',').replace(/%3A/gi, ':')
}

export function stringifySearch(search: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(search)) {
    const encoded = encodeValue(value)
    if (encoded !== undefined) parts.push(`${encodeComponent(key)}=${encodeComponent(encoded)}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

export function parseSearch(searchStr: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const query = searchStr.startsWith('?') ? searchStr.slice(1) : searchStr
  if (!query) return result
  for (const pair of query.split('&')) {
    if (!pair) continue
    const index = pair.indexOf('=')
    const rawKey = index === -1 ? pair : pair.slice(0, index)
    const rawValue = index === -1 ? '' : pair.slice(index + 1)
    try {
      const key = decodeURIComponent(rawKey.replace(/\+/g, ' ')).replace(/\[\]$/, '')
      const value = decodeURIComponent(rawValue.replace(/\+/g, ' '))
      // Repeated keys (`?status=a&status=b`, `status[]=a`) are accepted too and joined into the
      // canonical comma list (SPEC_RESOLUTIONS #39).
      const previous = result[key]
      result[key] = typeof previous === 'string' && previous !== '' ? `${previous},${value}` : value
    } catch {
      // malformed escape: ignore this pair
    }
  }
  return result
}

/** `"a,b"` | `["a","b"]` -> `["a","b"]` (trimmed, empties dropped). */
export function splitList(raw: unknown): string[] {
  const items = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(',') : []
  return items.map((item) => item.trim()).filter(Boolean)
}

// ---- zod helpers -------------------------------------------------------------------------

/** Free text; empty -> undefined. */
export function stringParam() {
  return z
    .string()
    .transform((value) => value.trim() || undefined)
    .optional()
    .catch(undefined)
}

/** Integer (any sign); invalid -> undefined. */
export function intParam() {
  return z
    .union([z.number(), z.string()])
    .transform((value) => Number(value))
    .pipe(z.number().int())
    .optional()
    .catch(undefined)
}

/** Positive integer id (`?sr=42`). */
export function idParam() {
  return z
    .union([z.number(), z.string()])
    .transform((value) => Number(value))
    .pipe(z.number().int().positive())
    .optional()
    .catch(undefined)
}

/** `true` / `false`. */
export function boolParam() {
  return z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .optional()
    .catch(undefined)
}

/** Business date `YYYY-MM-DD`. Relative tokens are resolved by the screen, not here. */
export function dateParam() {
  return z.string().regex(ISO_DATE).optional().catch(undefined)
}

/** One value of an enum (`?queue=mine`). */
export function enumParam<const T extends string>(values: readonly [T, ...T[]]) {
  return z.enum(values).optional().catch(undefined)
}

/** Comma list of enum values (`?status=invited,escalated`); unknown entries are dropped. */
export function listParam<const T extends string>(values: readonly [T, ...T[]]) {
  const allowed = new Set<string>(values)
  return z
    .union([z.array(z.enum(values)), z.string()])
    .transform((raw) => {
      const list = splitList(raw).filter((value): value is T => allowed.has(value))
      return list.length ? [...new Set(list)] : undefined
    })
    .optional()
    .catch(undefined)
}

/** Comma list of ids (`?regionId=1,4`); `allowNone` also accepts the literal `none`. */
export function idListParam<const N extends boolean = false>(options?: { allowNone?: N }) {
  const allowNone = options?.allowNone ?? false
  return z
    .union([z.array(z.union([z.number(), z.literal('none')])), z.string()])
    .transform((raw) => {
      const list: (number | 'none')[] = []
      for (const item of splitList(raw)) {
        if (item === 'none') {
          if (allowNone) list.push('none')
          continue
        }
        const id = Number(item)
        if (Number.isInteger(id) && id > 0) list.push(id)
      }
      return list.length
        ? ([...new Set(list)] as N extends true ? (number | 'none')[] : number[])
        : undefined
    })
    .optional()
    .catch(undefined)
}

/** Page number, default 1. */
export function pageParam() {
  return z
    .union([z.number(), z.string()])
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1))
    .catch(1)
    .default(1)
}

export const PER_PAGE_OPTIONS = [25, 50, 100] as const

/** Rows per page (API `perPage`, 1–200), default 25. */
export function perPageParam(defaultValue = 25) {
  return z
    .union([z.number(), z.string()])
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(200))
    .catch(defaultValue)
    .default(defaultValue)
}

// ---- shared list schema --------------------------------------------------------------------

/**
 * Base search schema of every list screen. Extend it per screen:
 *
 *   const searchSchema = listSearchSchema.extend({
 *     status: listParam(SR_STATUSES),
 *     regionId: idListParam({ allowNone: true }),
 *     includeClosed: boolParam(),
 *   })
 *   export const Route = createFileRoute('/_app/service-requests')({
 *     validateSearch: searchSchema,
 *     search: { middlewares: [stripSearchParams(listSearchDefaults)] },
 *   })
 */
export const listSearchSchema = z.object({
  q: stringParam(),
  /** API sort spec: `field,-field2`. */
  sort: stringParam(),
  page: pageParam(),
  perPage: perPageParam(),
  /** Active saved view id (`builtin:open` or `saved:12`). */
  view: stringParam(),
})

export type ListSearch = z.infer<typeof listSearchSchema>

export const listSearchDefaults = { page: 1, perPage: 25 } as const

// ---- sort helpers --------------------------------------------------------------------------

export interface SortField {
  field: string
  direction: 'asc' | 'desc'
}

/** `-openedAt,number` -> [{ openedAt desc }, { number asc }] */
export function parseSort(sort: string | undefined): SortField[] {
  return splitList(sort).map((part) =>
    part.startsWith('-')
      ? { field: part.slice(1), direction: 'desc' as const }
      : { field: part, direction: 'asc' as const },
  )
}

export function formatSort(fields: readonly SortField[]): string | undefined {
  if (fields.length === 0) return undefined
  return fields.map((f) => (f.direction === 'desc' ? `-${f.field}` : f.field)).join(',')
}
