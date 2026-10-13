import type { ActionDialogDescriptor } from '@/lib/registry'
import { RequestRescheduleDialog } from '@/modules/field/components/action-dialogs'

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'request_reschedule',
  order: 20,
  component: RequestRescheduleDialog,
}
export default dialog
