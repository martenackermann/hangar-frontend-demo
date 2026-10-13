import type { AssetDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { AssetMovements } from '../components/asset-movements'

/** Asset drawer › Movements: the append-only ledger, paged. */
const tab: DrawerTabDescriptor<AssetDetail> = {
  id: 'movements',
  label: 'Movements',
  order: 20,
  permission: 'stock.read',
  component: ({ entity }) => <AssetMovements asset={entity} />,
}
export default tab
