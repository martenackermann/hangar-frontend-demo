import type { ActionDialogDescriptor } from '@/lib/registry'
import { LeasePauseDialog } from '../components/lease-pause-dialog'

const dialog: ActionDialogDescriptor = {
  resource: 'leaseReturn',
  action: 'pause_communication',
  order: 40,
  component: LeasePauseDialog,
}
export default dialog
