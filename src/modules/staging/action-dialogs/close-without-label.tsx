import type { ActionDialogDescriptor } from '@/lib/registry'
import { CloseWithoutLabelDialog } from '@/modules/staging/components/close-without-label-dialog'

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'close_without_label',
  order: 45,
  component: CloseWithoutLabelDialog,
}

export default dialog
