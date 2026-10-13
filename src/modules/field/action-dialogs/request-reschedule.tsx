import type { ActionDialogDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const RequestRescheduleDialog = lazyNamed(
  () => import('@/modules/field/components/action-dialogs'),
  'RequestRescheduleDialog',
)

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'request_reschedule',
  order: 20,
  component: RequestRescheduleDialog,
}
export default dialog
