import { createRootRouteWithContext, Outlet, useMatches } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { AppShell } from '@/components/app/app-shell'
import { Devtools } from '@/components/app/devtools'
import { PUBLIC_PATHS, requireAuth } from '@/lib/auth/guards'
import type { RouterContext } from '@/router'

export const Route = createRootRouteWithContext<RouterContext>()({
  // Secure by default: every route except PUBLIC_PATHS needs a session.
  // Modules add authorisation with `beforeLoad: requirePermission('...')`.
  beforeLoad: ({ location }) => {
    if (!PUBLIC_PATHS.has(location.pathname)) requireAuth(location)
  },
  component: RootLayout,
})

function RootLayout() {
  const bare = useMatches({
    select: (matches) => matches.some((match) => match.staticData.layout === 'bare'),
  })

  return (
    <>
      {bare ? (
        <Outlet />
      ) : (
        <AppShell>
          <Outlet />
        </AppShell>
      )}
      <Toaster position="bottom-right" />
      <Devtools />
    </>
  )
}
