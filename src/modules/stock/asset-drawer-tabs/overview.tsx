import type { AssetDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { AssetOverview } from '../components/asset-overview'

/** Asset drawer › Overview (SCREENS.md §1.5): facts, SR/lease links, metadata edit. */
const tab: DrawerTabDescriptor<AssetDetail> = {
  id: 'overview',
  label: 'Overview',
  order: 10,
  permission: 'stock.read',
  component: ({ entity }) => <AssetOverview asset={entity} />,
}
export default tab
