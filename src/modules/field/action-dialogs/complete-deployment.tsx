import type { ActionDialogDescriptor } from '@/lib/registry'
import { CompleteDeploymentDialog } from '@/modules/field/components/action-dialogs'

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'complete_deployment',
  primary: true,
  order: 30,
  component: CompleteDeploymentDialog,
}
export default dialog
