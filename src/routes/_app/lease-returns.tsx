import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { requirePermission } from '@/lib/auth/guards'
import { listSearchDefaults } from '@/lib/search/params'
import { LeaseListPage } from '@/modules/requests/components/lease-list-page'
import { leaseSearchSchema, type LeaseSearch } from '@/modules/requests/search'

/** Lease returns (SCREENS.md §4.2). Owner: H1 (Requests & Comms). */
export const Route = createFileRoute('/_app/lease-returns')({
  validateSearch: leaseSearchSchema,
  search: { middlewares: [stripSearchParams(listSearchDefaults)] },
  beforeLoad: requirePermission('lease.read'),
  staticData: { title: 'Lease returns' },
  component: LeaseReturnsRoute,
})

function LeaseReturnsRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <LeaseListPage
      search={search}
      onSearch={(patch, replace) =>
        void navigate({ search: ((prev: LeaseSearch) => ({ ...prev, ...patch })) as never, replace })
      }
    />
  )
}
