import type { ServiceRequestDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { AppointmentTab } from '@/modules/field/components/appointment-tab'

const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'appointment',
  label: 'Appointment',
  order: 50,
  component: ({ entity }) => <AppointmentTab sr={entity} />,
}
export default tab
