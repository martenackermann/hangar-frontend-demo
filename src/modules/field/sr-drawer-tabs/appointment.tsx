import type { ServiceRequestDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const AppointmentTab = lazyNamed(
  () => import('@/modules/field/components/appointment-tab'),
  'AppointmentTab',
)

const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'appointment',
  label: 'Appointment',
  order: 50,
  preload: AppointmentTab.preload,
  component: ({ entity }) => <AppointmentTab sr={entity} />,
}
export default tab
