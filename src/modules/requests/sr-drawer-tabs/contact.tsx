import type { ServiceRequestDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { ContactPanel } from '../components/contact-panel'

const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'contact',
  label: 'Contact',
  order: 30,
  component: ({ entity }) => (
    <ContactPanel contactId={entity.contact.id} current={{ kind: 'sr', id: entity.id }} />
  ),
}
export default tab
