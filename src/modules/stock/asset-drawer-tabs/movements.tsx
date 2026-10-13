import type { AssetDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const AssetMovements = lazyNamed(
  () => import('@/modules/stock/components/asset-movements'),
  'AssetMovements',
)

/** Asset drawer › Movements: the append-only ledger, paged. */
const tab: DrawerTabDescriptor<AssetDetail> = {
  id: 'movements',
  label: 'Movements',
  order: 20,
  permission: 'stock.read',
  preload: AssetMovements.preload,
  component: ({ entity }) => <AssetMovements asset={entity} />,
}
export default tab
