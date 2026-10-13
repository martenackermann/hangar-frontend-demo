import type { ServiceRequestDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const OverviewTab = lazyNamed(
  () => import('@/modules/requests/components/sr-overview-tab'),
  'OverviewTab',
)

const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'overview',
  label: 'Overview',
  order: 10,
  component: OverviewTab,
}
export default tab
