import { createFileRoute, Outlet } from '@tanstack/react-router'
import { z } from 'zod'
import { AppShell } from '@/components/app/app-shell'
import { coreQueries } from '@/lib/api/core'
import { requireAuth } from '@/lib/auth/guards'
import { setMe } from '@/lib/auth/store'
import { setBusinessTimeZone } from '@/lib/format'
import { idParam, stringParam } from '@/lib/search/params'

/**
 * Authenticated layout (SCREENS.md §1): no session → `/login?redirect=…`. Loads `/me`,
 * `/meta/config` and `/meta/enums` once (cached for the session). Declares the drawer params
 * inherited by every child route: `sr`, `lr`, `asset`, `mail`, `tab`.
 */
const drawerSearchSchema = z.object({
  sr: idParam(),
  lr: idParam(),
  asset: idParam(),
  mail: idParam(),
  tab: stringParam(),
})

export const Route = createFileRoute('/_app')({
  validateSearch: drawerSearchSchema,
  beforeLoad: ({ location }) => requireAuth(location),
  loader: async ({ context }) => {
    const [me, config] = await Promise.all([
      context.queryClient.ensureQueryData(coreQueries.me()),
      context.queryClient.ensureQueryData(coreQueries.config()),
      context.queryClient.ensureQueryData(coreQueries.enums()),
    ])
    setMe(me)
    setBusinessTimeZone(config.businessTimeZone)
  },
  component: AppLayout,
})

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
