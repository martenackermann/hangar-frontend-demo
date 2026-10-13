import { stringifySearch } from './params'

/**
 * Saved views (SCREENS.md §0): a view is `route + search object`. Built-in views are defined in
 * code per screen; personal and shared views come from `/saved-views`. The active view id lives
 * in the URL (`?view=builtin:open` / `?view=saved:12`); editing filters afterwards marks it
 * "Modified".
 *
 * This module is the pure URL codec; `useSavedViews` (components/data-table) adds the API.
 */

/** Search keys that never belong to a view: paging, the open record and the view id itself. */
export const VOLATILE_SEARCH_KEYS: ReadonlySet<string> = new Set([
  'page',
  'view',
  'sr',
  'lr',
  'asset',
  'mail',
  'tab',
])

export type SearchObject = Record<string, unknown>

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(normalizeValue)
    // Filters are sets: order does not matter.
    return items.every((item) => typeof item === 'string' || typeof item === 'number')
      ? [...items].sort((a, b) => String(a).localeCompare(String(b), 'en', { numeric: true }))
      : items
  }
  return value
}

/**
 * Canonical form of a view's search: volatile keys, empty values and defaults removed, arrays
 * sorted, keys sorted. Two searches describe the same view iff their canonical forms are equal.
 */
export function canonicalViewSearch(
  search: SearchObject,
  defaults: SearchObject = {},
): SearchObject {
  const result: SearchObject = {}
  for (const key of Object.keys(search).sort()) {
    if (VOLATILE_SEARCH_KEYS.has(key)) continue
    const value = normalizeValue(search[key])
    if (isEmpty(value)) continue
    if (
      key in defaults &&
      JSON.stringify(normalizeValue(defaults[key])) === JSON.stringify(value)
    ) {
      continue
    }
    result[key] = value
  }
  return result
}

export function viewSearchEquals(
  a: SearchObject,
  b: SearchObject,
  defaults: SearchObject = {},
): boolean {
  return (
    JSON.stringify(canonicalViewSearch(a, defaults)) ===
    JSON.stringify(canonicalViewSearch(b, defaults))
  )
}

/** The view's state as a query string (status bar, copy link): `?status=escalated&sort=-sr`. */
export function encodeViewSearch(search: SearchObject, defaults: SearchObject = {}): string {
  return stringifySearch(canonicalViewSearch(search, defaults))
}

export type ViewId = `builtin:${string}` | `saved:${number}`

export function builtInViewId(key: string): ViewId {
  return `builtin:${key}`
}

export function savedViewId(id: number): ViewId {
  return `saved:${id}`
}

export function parseViewId(
  value: string | undefined,
): { kind: 'builtin'; key: string } | { kind: 'saved'; id: number } | undefined {
  if (!value) return undefined
  if (value.startsWith('builtin:')) return { kind: 'builtin', key: value.slice(8) }
  if (value.startsWith('saved:')) {
    const id = Number(value.slice(6))
    return Number.isInteger(id) && id > 0 ? { kind: 'saved', id } : undefined
  }
  return undefined
}

/** Search to navigate to when a view is selected: its filters + its id (page resets to 1). */
export function searchForView(viewId: ViewId, viewSearch: SearchObject): SearchObject {
  return { ...canonicalViewSearch(viewSearch), view: viewId }
}
