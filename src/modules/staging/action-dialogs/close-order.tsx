import type { ActionDialogDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const CloseOrderDialog = lazyNamed(
  () => import('@/modules/staging/components/close-order-dialog'),
  'CloseOrderDialog',
)

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'close_order',
  order: 30,
  component: CloseOrderDialog,
}

export default dialog
