import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/guards'
import { enumParam, idParam, pageParam } from '@/lib/search/params'
import { InventoryStationPage } from '@/modules/stock/components/inventory-station-page'

/**
 * Inventory scan station (SCREENS.md §7.3, comp `scan.html`). Owner: H5. View rule = the
 * primary GET (`inventory.read`, SPEC_RESOLUTIONS #36); scanning needs `inventory.scan`,
 * close/cancel `inventory.manage`.
 */
const searchSchema = z.object({
  zone: idParam(),
  category: enumParam(['missing', 'wrong_location', 'unknown', 'matched']),
  page: pageParam(),
})

export const Route = createFileRoute('/_app/stock/inventory/$inventoryId')({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams({ page: 1 })] },
  beforeLoad: requirePermission('inventory.read'),
  staticData: { title: 'Inventory scan station' },
  component: InventoryStationRoute,
})

function InventoryStationRoute() {
  const { inventoryId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <InventoryStationPage
      key={inventoryId}
      inventoryId={Number(inventoryId)}
      search={search}
      onSearchChange={(patch) => void navigate({ search: (prev) => ({ ...prev, ...patch }) })}
    />
  )
}
