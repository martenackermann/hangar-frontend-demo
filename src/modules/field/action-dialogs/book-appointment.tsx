import type { ActionDialogDescriptor } from '@/lib/registry'
import { BookAppointmentDialog } from '@/modules/field/components/action-dialogs'

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'book_appointment',
  primary: true,
  order: 10,
  component: BookAppointmentDialog,
}
export default dialog
