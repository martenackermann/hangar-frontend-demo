import { z } from 'zod'

/**
 * Shared search-param building blocks for list screens. Filters, sorting, paging and the
 * active saved view live in the URL, so every list state is linkable and restorable.
 *
 * Route usage (zod 4 implements Standard Schema, so TanStack Router takes it directly;
 * `@tanstack/zod-adapter` only supports zod 3 and is not used):
 *
 *   const searchSchema = listSearchSchema.extend({
 *     status: z.array(z.enum(SR_STATUSES)).optional().catch(undefined),
 *   })
 *   export const Route = createFileRoute('/requests/')({
 *     validateSearch: searchSchema,
 *     search: { middlewares: [stripSearchParams(listSearchDefaults)] },
 *   })
 *
 * Rules: every field is optional or has a default, and invalid values `.catch()` to the
 * default instead of throwing, so stale or hand-edited URLs never break a screen.
 */

export const PAGE_SIZES = [25, 50, 100] as const

export const listSearchDefaults = {
  page: 1,
  pageSize: 25,
} as const

export const listSearchSchema = z.object({
  /** 1-based page number. */
  page: z.number().int().min(1).default(listSearchDefaults.page).catch(listSearchDefaults.page),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(listSearchDefaults.pageSize)
    .catch(listSearchDefaults.pageSize),
  /** Sort spec, comma separated, `-` prefix = descending: `-openedAt,number`. */
  sort: z.string().optional().catch(undefined),
  /** Free-text search. */
  q: z.string().optional().catch(undefined),
  /** Id of the active saved view (the view's stored search params are applied on select). */
  view: z.string().optional().catch(undefined),
})

export type ListSearch = z.infer<typeof listSearchSchema>

export interface SortField {
  field: string
  direction: 'asc' | 'desc'
}

/** `-openedAt,number` -> [{ field: 'openedAt', direction: 'desc' }, { field: 'number', direction: 'asc' }] */
export function parseSort(sort: string | undefined): SortField[] {
  if (!sort) return []
  return sort
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part.startsWith('-')
        ? { field: part.slice(1), direction: 'desc' as const }
        : { field: part, direction: 'asc' as const },
    )
}

export function formatSort(fields: readonly SortField[]): string | undefined {
  if (fields.length === 0) return undefined
  return fields.map((f) => (f.direction === 'desc' ? `-${f.field}` : f.field)).join(',')
}
