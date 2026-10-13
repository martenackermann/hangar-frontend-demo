import type { LeaseReturnDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { HistoryTimeline } from '../components/history-timeline'

const tab: DrawerTabDescriptor<LeaseReturnDetail> = {
  id: 'history',
  label: 'History',
  order: 90,
  component: ({ entity }) => <HistoryTimeline kind="lr" id={entity.id} />,
}
export default tab
