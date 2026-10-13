import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { requirePermission } from '@/lib/auth/guards'
import { listSearchDefaults } from '@/lib/search/params'
import { CommsPage } from '@/modules/requests/components/comms/comms-page'
import { commsSearchSchema, type CommsSearch } from '@/modules/requests/search'

/** Communications (SCREENS.md §4.3). Owner: H1 (Requests & Comms). */
export const Route = createFileRoute('/_app/communications')({
  validateSearch: commsSearchSchema,
  search: { middlewares: [stripSearchParams(listSearchDefaults)] },
  beforeLoad: requirePermission('comms.read'),
  staticData: { title: 'Communications' },
  component: CommunicationsRoute,
})

function CommunicationsRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <CommsPage
      search={search}
      onSearch={(patch, replace) =>
        void navigate({ search: ((prev: CommsSearch) => ({ ...prev, ...patch })) as never, replace })
      }
    />
  )
}
