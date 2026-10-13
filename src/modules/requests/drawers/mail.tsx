import type { ParamDrawerDescriptor } from '@/lib/registry'
import { MailDrawer } from '../components/mail-drawer'

const descriptor: ParamDrawerDescriptor = {
  param: 'mail',
  permission: 'comms.read',
  component: MailDrawer,
}
export default descriptor
