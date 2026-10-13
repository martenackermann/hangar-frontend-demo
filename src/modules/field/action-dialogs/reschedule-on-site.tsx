import type { ActionDialogDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const RescheduleOnSiteDialog = lazyNamed(
  () => import('@/modules/field/components/action-dialogs'),
  'RescheduleOnSiteDialog',
)

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'reschedule_on_site',
  order: 40,
  component: RescheduleOnSiteDialog,
}
export default dialog
