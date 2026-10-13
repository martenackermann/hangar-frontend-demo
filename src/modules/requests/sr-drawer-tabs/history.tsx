import type { ServiceRequestDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const HistoryTimeline = lazyNamed(
  () => import('@/modules/requests/components/history-timeline'),
  'HistoryTimeline',
)

const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'history',
  label: 'History',
  order: 90,
  preload: HistoryTimeline.preload,
  component: ({ entity }) => <HistoryTimeline kind="sr" id={entity.id} />,
}
export default tab
