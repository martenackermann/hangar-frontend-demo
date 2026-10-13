import type { ActionDialogDescriptor } from '@/lib/registry'
import { LinkDialog } from '../components/link-service-request-dialog'

const dialog: ActionDialogDescriptor = {
  resource: 'leaseReturn',
  action: 'link_service_request',
  order: 30,
  component: LinkDialog,
}
export default dialog
