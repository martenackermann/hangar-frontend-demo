import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { requirePermission } from '@/lib/auth/guards'
import { listSearchDefaults } from '@/lib/search/params'
import { SrListPage } from '@/modules/requests/components/sr-list-page'
import { srSearchSchema, type SrSearch } from '@/modules/requests/search'

/** Service requests (SCREENS.md §4.1). Owner: H1 (Requests & Comms). */
export const Route = createFileRoute('/_app/service-requests')({
  validateSearch: srSearchSchema,
  search: { middlewares: [stripSearchParams(listSearchDefaults)] },
  beforeLoad: requirePermission('sr.read'),
  staticData: { title: 'Service requests' },
  component: ServiceRequestsRoute,
})

function ServiceRequestsRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SrListPage
      search={search}
      onSearch={(patch, replace) =>
        void navigate({ search: ((prev: SrSearch) => ({ ...prev, ...patch })) as never, replace })
      }
    />
  )
}
