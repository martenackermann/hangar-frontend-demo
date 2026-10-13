import type { LeaseReturnDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const HistoryTimeline = lazyNamed(
  () => import('@/modules/requests/components/history-timeline'),
  'HistoryTimeline',
)

const tab: DrawerTabDescriptor<LeaseReturnDetail> = {
  id: 'history',
  label: 'History',
  order: 90,
  preload: HistoryTimeline.preload,
  component: ({ entity }) => <HistoryTimeline kind="lr" id={entity.id} />,
}
export default tab
