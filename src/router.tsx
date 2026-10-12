import { createRouter } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { NotFound, PendingPage, RouteError } from '@/components/feedback/route-error'
import { setUnauthorizedHandler } from '@/lib/api/client'
import { createQueryClient } from '@/lib/query/client'
import { routeTree } from './routeTree.gen'

export interface RouterContext {
  queryClient: QueryClient
}

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient } satisfies RouterContext,
    // Loaders always run; TanStack Query decides whether cached data is fresh enough.
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: NotFound,
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
    /** `bare` renders the route without the app shell (login, print views). */
    layout?: 'app' | 'bare'
    /** Page title for the document title / breadcrumbs (phase 2b). */
    title?: string
  }
}
