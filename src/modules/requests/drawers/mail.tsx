import type { ParamDrawerDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const MailDrawer = lazyNamed(
  () => import('@/modules/requests/components/mail-drawer'),
  'MailDrawer',
)

const descriptor: ParamDrawerDescriptor = {
  param: 'mail',
  permission: 'comms.read',
  component: MailDrawer,
}
export default descriptor
