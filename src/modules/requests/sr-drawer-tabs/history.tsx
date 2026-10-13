import type { ServiceRequestDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { HistoryTimeline } from '../components/history-timeline'

const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'history',
  label: 'History',
  order: 90,
  component: ({ entity }) => <HistoryTimeline kind="sr" id={entity.id} />,
}
export default tab
