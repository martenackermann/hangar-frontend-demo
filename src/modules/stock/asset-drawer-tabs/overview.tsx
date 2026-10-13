import type { AssetDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const AssetOverview = lazyNamed(
  () => import('@/modules/stock/components/asset-overview'),
  'AssetOverview',
)

/** Asset drawer › Overview (SCREENS.md §1.5): facts, SR/lease links, metadata edit. */
const tab: DrawerTabDescriptor<AssetDetail> = {
  id: 'overview',
  label: 'Overview',
  order: 10,
  permission: 'stock.read',
  preload: AssetOverview.preload,
  component: ({ entity }) => <AssetOverview asset={entity} />,
}
export default tab
