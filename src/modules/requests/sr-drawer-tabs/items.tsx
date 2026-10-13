import type { ServiceRequestDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { ItemsTab } from '../components/sr-items-tab'

const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'items',
  label: 'Items',
  order: 20,
  count: (sr) => sr.items.length,
  component: ItemsTab,
}
export default tab
