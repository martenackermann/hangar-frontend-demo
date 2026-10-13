import type { ServiceRequestDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { OverviewTab } from '../components/sr-overview-tab'

const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'overview',
  label: 'Overview',
  order: 10,
  component: OverviewTab,
}
export default tab
