import type { ActionDialogDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const SrPauseDialog = lazyNamed(
  () => import('@/modules/requests/components/sr-pause-dialog'),
  'SrPauseDialog',
)

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'pause_communication',
  order: 40,
  component: SrPauseDialog,
}
export default dialog
