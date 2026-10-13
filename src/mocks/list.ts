import { HttpResponse } from 'msw'
import type { Page } from '@/lib/api/types'
import { problems } from './http'

/**
 * List endpoints (API.md §1.2–1.3): `?page=1&perPage=25`, `?sort=field,-field2` (ties by id
 * asc; unknown field → 422 `errors.sort`), comma-separated multi-value filters, `q` free text.
 * Response envelope `{ data, meta: { page, perPage, total, totalPages } }`.
 *
 *   http.get(apiPath('/service-requests'), ({ request }) =>
 *     listResponse(rows, request, {
 *       sortable: { number: (r) => r.number, importedAt: (r) => r.importedAt },
 *       defaultSort: '-importedAt',
 *       search: (r, q) => r.number.includes(q.toUpperCase()),
 *       filters: { status: filterIn((r) => r.status) },
 *       map: (r) => toListItem(r),
 *     }))
 */

export interface SortField {
  field: string
  direction: 'asc' | 'desc'
}

export function parseSortParam(value: string | null): SortField[] {
  if (!value) return []
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part.startsWith('-')
        ? { field: part.slice(1), direction: 'desc' as const }
        : { field: part, direction: 'asc' as const },
    )
}

/** Comma-separated (canonical) and repeated values of one query param. */
export function multiValue(searchParams: URLSearchParams, name: string): string[] {
  return searchParams
    .getAll(name)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

export function boolValue(searchParams: URLSearchParams, name: string): boolean | undefined {
  const value = searchParams.get(name)
  return value === 'true' ? true : value === 'false' ? false : undefined
}

export interface PageParams {
  page: number
  perPage: number
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function parsePage(searchParams: URLSearchParams, defaultPerPage = 25): PageParams {
  return {
    page: positiveInt(searchParams.get('page'), 1),
    perPage: Math.min(positiveInt(searchParams.get('perPage'), defaultPerPage), 200),
  }
}

export function paginate<T>(items: readonly T[], { page, perPage }: PageParams): Page<T> {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const start = (page - 1) * perPage
  return { data: items.slice(start, start + perPage), meta: { page, perPage, total, totalPages } }
}

/** A filter: query param values (non-empty) → predicate. */
export type FilterFn<T> = (row: T, values: string[]) => boolean

/** `status=a,b` matches rows whose accessor value is a or b. */
export function filterIn<T>(get: (row: T) => string | number | null | undefined): FilterFn<T> {
  return (row, values) => values.includes(String(get(row)))
}

/** Boolean flag filter (`campus=true`). */
export function filterBool<T>(get: (row: T) => boolean): FilterFn<T> {
  return (row, [value]) => (value === 'true' ? get(row) : value === 'false' ? !get(row) : true)
}

/** Inclusive date range on an ISO date/timestamp (compare the `YYYY-MM-DD` part). */
export function filterFrom<T>(get: (row: T) => string | null | undefined): FilterFn<T> {
  return (row, [from]) => {
    const value = get(row)
    return !from || (value !== null && value !== undefined && value.slice(0, 10) >= from)
  }
}
export function filterTo<T>(get: (row: T) => string | null | undefined): FilterFn<T> {
  return (row, [to]) => {
    const value = get(row)
    return !to || (value !== null && value !== undefined && value.slice(0, 10) <= to)
  }
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

export function compareValues(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === ''
  const bEmpty = b === null || b === undefined || b === ''
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1 // empties last
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return collator.compare(sortText(a), sortText(b))
}

function sortText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value)
  return JSON.stringify(value) ?? ''
}

export interface ListOptions<T, R> {
  /** Sortable fields → accessor. Unknown sort fields → 422. */
  sortable?: Record<string, (row: T) => unknown>
  /** Applied when `?sort` is absent, e.g. `-importedAt`. */
  defaultSort?: string
  /** Free text `q`. */
  search?: (row: T, q: string) => boolean
  /** Query param → predicate. */
  filters?: Record<string, FilterFn<T>>
  defaultPerPage?: number
  /** Row → response item (DTO, availableActions, …). */
  map?: (row: T) => R
  /** Id accessor for the stable tie-break (default `row.id`). */
  id?: (row: T) => number
}

/** Filter + search + sort (no paging). Returns a 422 response for an unknown sort field. */
export function queryRows<T>(
  rows: readonly T[],
  request: Request,
  options: Omit<ListOptions<T, unknown>, 'map' | 'defaultPerPage'> = {},
): T[] | Response {
  const { searchParams } = new URL(request.url)
  let result = [...rows]
  for (const [param, predicate] of Object.entries(options.filters ?? {})) {
    const values = multiValue(searchParams, param)
    if (values.length > 0) result = result.filter((row) => predicate(row, values))
  }
  const q = searchParams.get('q')?.trim()
  if (q && options.search) result = result.filter((row) => options.search?.(row, q) ?? true)

  const sort = parseSortParam(searchParams.get('sort') ?? options.defaultSort ?? null)
  const unknown = sort.filter((s) => !options.sortable?.[s.field])
  if (unknown.length > 0 && searchParams.get('sort')) {
    return problems.validation(
      { sort: [`Unknown sort field: ${unknown.map((s) => s.field).join(', ')}`] },
      undefined,
      request,
    )
  }
  const getId = options.id ?? ((row: T) => (row as { id: number }).id)
  const accessors = sort
    .filter((s) => options.sortable?.[s.field])
    .map((s) => ({
      read: options.sortable?.[s.field] ?? (() => null),
      sign: s.direction === 'desc' ? -1 : 1,
    }))
  result.sort((a, b) => {
    for (const { read, sign } of accessors) {
      const va = read(a)
      const vb = read(b)
      const empty = (v: unknown) => v === null || v === undefined || v === ''
      const diff = empty(va) || empty(vb) ? compareValues(va, vb) : sign * compareValues(va, vb)
      if (diff !== 0) return diff
    }
    return getId(a) - getId(b)
  })
  return result
}

/** One-liner list endpoint returning the `Page<R>` envelope. */
export function listResponse<T, R = T>(
  rows: readonly T[],
  request: Request,
  options: ListOptions<T, R> = {},
) {
  const queried = queryRows(rows, request, options)
  if (queried instanceof Response) return queried
  const page = paginate(
    queried,
    parsePage(new URL(request.url).searchParams, options.defaultPerPage),
  )
  const map = options.map ?? ((row: T) => row as unknown as R)
  return HttpResponse.json({ data: page.data.map(map), meta: page.meta })
}
