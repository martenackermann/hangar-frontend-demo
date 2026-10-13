import { MutationCache, QueryCache, QueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isApiError } from '@/lib/api/errors'

/** Typed `meta` for queries and mutations (see CONVENTIONS.md, "Queries"). */
export interface HangarQueryMeta extends Record<string, unknown> {
  /** Toast background-refetch failures of this query (default true). Initial load errors render inline. */
  errorToast?: boolean
  /** Keep an offline copy in IndexedDB (`@/lib/query/persist`; also set `gcTime: PERSIST_MAX_AGE`). */
  persist?: boolean
}

export interface HangarMutationMeta extends Record<string, unknown> {
  /** Query keys (prefixes) to invalidate after success; the mutation stays pending until refetched. */
  invalidates?: readonly QueryKey[]
  /** Toast shown on success. */
  successToast?: string
  /** Toast title on failure; `false` disables the global toast (e.g. form shows field errors). */
  errorToast?: string | false
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: HangarQueryMeta
    mutationMeta: HangarMutationMeta
  }
}

function describeError(error: unknown): { title: string; description?: string } {
  if (isApiError(error)) return { title: error.title, description: error.detail }
  if (error instanceof Error) return { title: 'Something went wrong', description: error.message }
  return { title: 'Something went wrong' }
}

export function createQueryClient(): QueryClient {
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Only background refetch failures; components render initial load errors themselves.
        if (query.state.data === undefined || query.meta?.errorToast === false) return
        const { title, description } = describeError(error)
        toast.error(title, { description })
      },
    }),
    mutationCache: new MutationCache({
      onSuccess: async (_data, _variables, _context, mutation) => {
        const { invalidates, successToast } = mutation.meta ?? {}
        if (successToast) toast.success(successToast)
        if (invalidates?.length) {
          await Promise.all(
            invalidates.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
          )
        }
      },
      onError: (error, _variables, _context, mutation) => {
        const errorToast = mutation.meta?.errorToast
        if (errorToast === false) return
        const { title, description } = describeError(error)
        toast.error(errorToast ?? title, {
          description: errorToast ? (description ?? title) : description,
        })
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          // Never retry client errors (4xx); retry network/server errors twice.
          if (isApiError(error) && error.status >= 400 && error.status < 500) return false
          return failureCount < 2
        },
      },
      mutations: {
        retry: false,
      },
    },
  })
  return queryClient
}
