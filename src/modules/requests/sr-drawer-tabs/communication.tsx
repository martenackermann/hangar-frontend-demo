import type { ServiceRequestDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const CommunicationTab = lazyNamed(
  () => import('@/modules/requests/components/sr-communication-tab'),
  'CommunicationTab',
)

const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'communication',
  label: 'Communication',
  order: 40,
  permission: 'comms.read',
  component: CommunicationTab,
}
export default tab
