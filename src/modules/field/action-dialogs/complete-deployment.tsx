import type { ActionDialogDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const CompleteDeploymentDialog = lazyNamed(
  () => import('@/modules/field/components/action-dialogs'),
  'CompleteDeploymentDialog',
)

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'complete_deployment',
  primary: true,
  order: 30,
  component: CompleteDeploymentDialog,
}
export default dialog
