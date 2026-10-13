import type { ServiceRequestDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { CommunicationTab } from '../components/sr-communication-tab'

const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'communication',
  label: 'Communication',
  order: 40,
  permission: 'comms.read',
  component: CommunicationTab,
}
export default tab
