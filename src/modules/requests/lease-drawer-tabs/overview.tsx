import type { LeaseReturnDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { OverviewTab } from '../components/lease-overview-tab'

const tab: DrawerTabDescriptor<LeaseReturnDetail> = {
  id: 'overview',
  label: 'Overview',
  order: 10,
  component: OverviewTab,
}
export default tab
