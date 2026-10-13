import type { ActionDialogDescriptor } from '@/lib/registry'
import { RescheduleOnSiteDialog } from '@/modules/field/components/action-dialogs'

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'reschedule_on_site',
  order: 40,
  component: RescheduleOnSiteDialog,
}
export default dialog
