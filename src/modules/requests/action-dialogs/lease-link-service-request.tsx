import type { ActionDialogDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const LinkDialog = lazyNamed(
  () => import('@/modules/requests/components/link-service-request-dialog'),
  'LinkDialog',
)

const dialog: ActionDialogDescriptor = {
  resource: 'leaseReturn',
  action: 'link_service_request',
  order: 30,
  component: LinkDialog,
}
export default dialog
