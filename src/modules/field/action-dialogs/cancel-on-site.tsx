import type { ActionDialogDescriptor } from '@/lib/registry'
import { CancelOnSiteDialog } from '@/modules/field/components/action-dialogs'

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'cancel_on_site',
  order: 50,
  component: CancelOnSiteDialog,
}
export default dialog
