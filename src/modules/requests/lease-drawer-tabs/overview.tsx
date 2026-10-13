import type { LeaseReturnDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const OverviewTab = lazyNamed(
  () => import('@/modules/requests/components/lease-overview-tab'),
  'OverviewTab',
)

const tab: DrawerTabDescriptor<LeaseReturnDetail> = {
  id: 'overview',
  label: 'Overview',
  order: 10,
  component: OverviewTab,
}
export default tab
