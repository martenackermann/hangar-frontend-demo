import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/guards'
import {
  idListParam,
  listParam,
  listSearchDefaults,
  pageParam,
  perPageParam,
} from '@/lib/search/params'
import { InventoryListPage } from '@/modules/stock/components/inventory-list-page'

/** Inventory (SCREENS.md §7.3). Owner: H5. Site cards (hubs + Campus, #28) + history. */
const searchSchema = z.object({
  siteId: idListParam(),
  status: listParam(['open', 'closed', 'cancelled']),
  page: pageParam(),
  perPage: perPageParam(),
})

export const Route = createFileRoute('/_app/stock/inventory/')({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(listSearchDefaults)] },
  beforeLoad: requirePermission('inventory.read'),
  staticData: { title: 'Inventory' },
  component: InventoryRoute,
})

function InventoryRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <InventoryListPage
      search={search}
      onSearchChange={(patch) => {
        const { view: _view, q: _q, ...rest } = patch
        void _view
        void _q
        void navigate({ search: (prev) => ({ ...prev, ...rest }) })
      }}
    />
  )
}
