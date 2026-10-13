import type { ActionDialogDescriptor } from '@/lib/registry'
import { CloseOrderDialog } from '@/modules/staging/components/close-order-dialog'

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'close_order',
  order: 30,
  component: CloseOrderDialog,
}

export default dialog
