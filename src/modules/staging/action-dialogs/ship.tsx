import type { ActionDialogDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const ShipDialog = lazyNamed(() => import('@/modules/staging/components/ship-dialog'), 'ShipDialog')

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'ship',
  primary: true,
  order: 40,
  component: ShipDialog,
}

export default dialog
