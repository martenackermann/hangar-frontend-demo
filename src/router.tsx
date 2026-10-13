import type { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { NotFoundPage, PendingPage, RouteError } from '@/components/app/error-pages'
import { setUnauthorizedHandler } from '@/lib/api/client'
import { createQueryClient } from '@/lib/query/client'
import { parseSearch, stringifySearch } from '@/lib/search/params'
import { routeTree } from './routeTree.gen'

export interface RouterContext {
  queryClient: QueryClient
}

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient } satisfies RouterContext,
    // Readable URLs: comma lists, no JSON (SCREENS.md §0, SPEC_RESOLUTIONS #39).
    parseSearch,
    stringifySearch,
    // Loaders always run; TanStack Query decides whether cached data is fresh enough.
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: NotFoundPage,
    defaultPendingComponent: PendingPage,
  })
}

export const queryClient = createQueryClient()
export const router = createAppRouter(queryClient)

// 401 from the API (expired/revoked session): the client already signed out; go to /login.
setUnauthorizedHandler(() => {
  const { pathname, href } = router.state.location
  if (pathname === '/login') return
  queryClient.clear()
  void router.navigate({ to: '/login', search: { redirect: href } })
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
  interface StaticDataRouteOption {
    /** Page title for breadcrumbs and `<title>`. */
    title?: string
  }
}
