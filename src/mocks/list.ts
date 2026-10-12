import { HttpResponse } from 'msw'

/**
 * Shared list behaviour for mock endpoints: paging, sorting, free-text search and filters,
 * so every slice's mock list endpoint behaves like the real API.
 *
 * Query string (PLACEHOLDER (phase 2a), aligned with API.md in phase 2b):
 *   ?page=1&pageSize=25&sort=-openedAt,number&q=text&status=a&status=b   (or status=a,b)
 * Response envelope (PLACEHOLDER, see `Page<T>`): { items, total, page, pageSize }
 */

export interface SortSpec {
  field: string
  direction: 'asc' | 'desc'
}

export interface ListParams {
  page: number
  pageSize: number
  sort: SortSpec[]
  q: string | undefined
  /** All query params, for module-specific filters. */
  searchParams: URLSearchParams
}

export interface ListParamOptions {
  defaultPageSize?: number
  maxPageSize?: number
  defaultSort?: SortSpec[]
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function parseSortParam(value: string | null): SortSpec[] {
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

export function parseListParams(
  input: Request | URL | string,
  options: ListParamOptions = {},
): ListParams {
  const url =
    input instanceof Request ? new URL(input.url) : input instanceof URL ? input : new URL(input)
  const { searchParams } = url
  const maxPageSize = options.maxPageSize ?? 200
  const sort = parseSortParam(searchParams.get('sort'))
  const q = searchParams.get('q')?.trim()
  return {
    page: positiveInt(searchParams.get('page'), 1),
    pageSize: Math.min(
      positiveInt(searchParams.get('pageSize'), options.defaultPageSize ?? 25),
      maxPageSize,
    ),
    sort: sort.length > 0 ? sort : (options.defaultSort ?? []),
    q: q === '' ? undefined : q,
    searchParams,
  }
}

/** Repeated (`?s=a&s=b`) and comma separated (`?s=a,b`) values of one query param. */
export function multiValue(searchParams: URLSearchParams, name: string): string[] {
  return searchParams
    .getAll(name)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

type Accessor<T> = (record: T) => unknown

/** Filter predicate for one query param; receives the param's values (never empty). */
export type FilterFn<T> = (record: T, values: string[]) => boolean

export interface ListQueryOptions<T> {
  /** Fields searched by `q` (case-insensitive substring). */
  searchFields?: readonly (keyof T | Accessor<T>)[]
  /** Query param name -> predicate. Params absent from the URL are ignored. */
  filters?: Record<string, FilterFn<T>>
  /** Sort field -> value accessor; default: the record property of the same name. */
  sortAccessors?: Record<string, Accessor<T>>
}

/** `status=a,b` matches records whose `status` is a or b. */
export function filterIn<T>(field: keyof T): FilterFn<T> {
  return (record, values) => values.includes(toText(record[field]))
}

/** Boolean flag filter: `vip=true` / `vip=false`. */
export function filterBoolean<T>(field: keyof T): FilterFn<T> {
  return (record, values) => values.includes(String(Boolean(record[field])))
}

/** Date range filter on an ISO date field: `openedFrom` / `openedTo` style (inclusive). */
export function filterDateFrom<T>(field: keyof T): FilterFn<T> {
  return (record, [from]) => !from || toText(record[field]) >= from
}
export function filterDateTo<T>(field: keyof T): FilterFn<T> {
  return (record, [to]) => !to || toText(record[field]).slice(0, to.length) <= to
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/** Text form of a field value for search and string comparison. */
export function toText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (value instanceof Date) return value.toISOString()
  return JSON.stringify(value)
}

export function compareValues(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === ''
  const bEmpty = b === null || b === undefined || b === ''
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1 // empties last
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  return collator.compare(toText(a), toText(b))
}

function readField<T>(record: T, field: keyof T | Accessor<T>): unknown {
  return typeof field === 'function' ? field(record) : record[field]
}

/** Filter, search and sort (no paging). */
export function applyListQuery<T>(
  items: readonly T[],
  params: Pick<ListParams, 'q' | 'sort' | 'searchParams'>,
  options: ListQueryOptions<T> = {},
): T[] {
  let result = [...items]

  for (const [param, predicate] of Object.entries(options.filters ?? {})) {
    const values = multiValue(params.searchParams, param)
    if (values.length > 0) result = result.filter((record) => predicate(record, values))
  }

  if (params.q && options.searchFields?.length) {
    const needle = params.q.toLowerCase()
    const fields = options.searchFields
    result = result.filter((record) =>
      fields.some((field) => toText(readField(record, field)).toLowerCase().includes(needle)),
    )
  }

  if (params.sort.length > 0) {
    const accessors = params.sort.map(({ field, direction }) => ({
      read:
        options.sortAccessors?.[field] ??
        ((record: T) => (record as Record<string, unknown>)[field]),
      sign: direction === 'desc' ? -1 : 1,
    }))
    result.sort((a, b) => {
      for (const { read, sign } of accessors) {
        const valueA = read(a)
        const valueB = read(b)
        const emptyA = valueA === null || valueA === undefined || valueA === ''
        const emptyB = valueB === null || valueB === undefined || valueB === ''
        // Empty values sort last regardless of direction.
        const diff =
          emptyA || emptyB ? compareValues(valueA, valueB) : sign * compareValues(valueA, valueB)
        if (diff !== 0) return diff
      }
      return 0
    })
  }

  return result
}

/** List response envelope. PLACEHOLDER (phase 2a): aligned with API.md in phase 2b. */
export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize }
}

export interface ListResponseOptions<T, R> extends ListQueryOptions<T>, ListParamOptions {
  /** Map each record of the returned page (e.g. add `availableActions`, embed relations). */
  map?: (record: T) => R
}

/**
 * One-liner list endpoint:
 *
 *   http.get(apiPath('/service-requests'), ({ request }) =>
 *     listResponse(db.collection('serviceRequests').all(), request, {
 *       searchFields: ['number', 'requesterName'],
 *       filters: { status: filterIn('status') },
 *       defaultSort: [{ field: 'openedAt', direction: 'desc' }],
 *       map: (sr) => ({ ...sr, availableActions: srMachine.availableActions(sr, ctx) }),
 *     }))
 */
export function listResponse<T, R = T>(
  items: readonly T[],
  request: Request,
  options: ListResponseOptions<T, R> = {},
) {
  const params = parseListParams(request, options)
  const rows = applyListQuery(items, params, options)
  const page = paginate(rows, params.page, params.pageSize)
  const map = options.map ?? ((record: T) => record as unknown as R)
  return HttpResponse.json<Page<R>>({ ...page, items: page.items.map(map) })
}
