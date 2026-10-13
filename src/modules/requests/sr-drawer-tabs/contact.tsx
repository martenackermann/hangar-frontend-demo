import type { ServiceRequestDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const ContactPanel = lazyNamed(
  () => import('@/modules/requests/components/contact-panel'),
  'ContactPanel',
)

const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'contact',
  label: 'Contact',
  order: 30,
  preload: ContactPanel.preload,
  component: ({ entity }) => (
    <ContactPanel contactId={entity.contact.id} current={{ kind: 'sr', id: entity.id }} />
  ),
}
export default tab
