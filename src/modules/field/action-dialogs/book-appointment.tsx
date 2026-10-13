import type { ActionDialogDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const BookAppointmentDialog = lazyNamed(
  () => import('@/modules/field/components/action-dialogs'),
  'BookAppointmentDialog',
)

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'book_appointment',
  primary: true,
  order: 10,
  component: BookAppointmentDialog,
}
export default dialog
