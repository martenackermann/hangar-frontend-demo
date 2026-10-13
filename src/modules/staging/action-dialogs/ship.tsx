import type { ActionDialogDescriptor } from '@/lib/registry'
import { ShipDialog } from '@/modules/staging/components/ship-dialog'

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'ship',
  primary: true,
  order: 40,
  component: ShipDialog,
}

export default dialog
