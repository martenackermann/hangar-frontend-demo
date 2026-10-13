import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/guards'
import { boolParam, enumParam, idListParam, listParam, stringParam } from '@/lib/search/params'
import { MatrixPage } from '@/modules/stock/components/matrix-page'

/**
 * Stock matrix (SCREENS.md §7.1). Owner: H5. Article × hub heat grid with buffers, order
 * quantities (#18), recalculation (`r`), export and "Create call-off order…" per hub.
 */
const CATEGORIES = [
  'laptop',
  'desktop',
  'tablet',
  'docking_station',
  'monitor',
  'headset',
  'keyboard',
  'mouse',
  'webcam',
  'bag',
  'accessory',
] as const

const searchSchema = z.object({
  siteId: idListParam(),
  category: listParam(CATEGORIES),
  q: stringParam(),
  onlyShortfall: boolParam(),
  includeInactive: boolParam(),
  sort: enumParam(['number', 'name', 'orderQty']),
})

export const Route = createFileRoute('/_app/stock/matrix')({
  validateSearch: searchSchema,
  beforeLoad: requirePermission('stock.read'),
  staticData: { title: 'Stock matrix' },
  component: StockMatrixRoute,
})

function StockMatrixRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <MatrixPage
      search={search}
      onSearchChange={(patch) => {
        const { page: _page, view: _view, ...rest } = patch
        void _page
        void _view
        void navigate({ search: (prev) => ({ ...prev, ...rest }) })
      }}
    />
  )
}
