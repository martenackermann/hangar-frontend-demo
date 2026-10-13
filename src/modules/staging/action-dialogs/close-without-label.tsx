import type { ActionDialogDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const CloseWithoutLabelDialog = lazyNamed(
  () => import('@/modules/staging/components/close-without-label-dialog'),
  'CloseWithoutLabelDialog',
)

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'close_without_label',
  order: 45,
  component: CloseWithoutLabelDialog,
}

export default dialog
