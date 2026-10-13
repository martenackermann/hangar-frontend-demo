import type { ActionDialogDescriptor } from '@/lib/registry'
import { SrPauseDialog } from '../components/sr-pause-dialog'

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'pause_communication',
  order: 40,
  component: SrPauseDialog,
}
export default dialog
