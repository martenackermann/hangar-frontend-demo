import type { ServiceRequestDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const ItemsTab = lazyNamed(() => import('@/modules/requests/components/sr-items-tab'), 'ItemsTab')

const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'items',
  label: 'Items',
  order: 20,
  count: (sr) => sr.items.length,
  component: ItemsTab,
}
export default tab
