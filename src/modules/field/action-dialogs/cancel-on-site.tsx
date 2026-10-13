import type { ActionDialogDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const CancelOnSiteDialog = lazyNamed(
  () => import('@/modules/field/components/action-dialogs'),
  'CancelOnSiteDialog',
)

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'cancel_on_site',
  order: 50,
  component: CancelOnSiteDialog,
}
export default dialog
