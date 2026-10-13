import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/guards'
import { idParam } from '@/lib/search/params'
import { DashboardPage } from '@/modules/stock/components/dashboard-page'

/** Dashboard (SCREENS.md §3.2). Owner: H5. Filters `siteId`, `regionId`; refetch every 60 s. */
const searchSchema = z.object({ siteId: idParam(), regionId: idParam() })

export const Route = createFileRoute('/_app/dashboard')({
  validateSearch: searchSchema,
  beforeLoad: requirePermission('dashboard.read'),
  staticData: { title: 'Dashboard' },
  component: Dashboard,
})

function Dashboard() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <DashboardPage
      search={search}
      onSearchChange={(patch) => void navigate({ search: (prev) => ({ ...prev, ...patch }) })}
    />
  )
}
