import type { ActionDialogDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const LeasePauseDialog = lazyNamed(
  () => import('@/modules/requests/components/lease-pause-dialog'),
  'LeasePauseDialog',
)

const dialog: ActionDialogDescriptor = {
  resource: 'leaseReturn',
  action: 'pause_communication',
  order: 40,
  component: LeasePauseDialog,
}
export default dialog
