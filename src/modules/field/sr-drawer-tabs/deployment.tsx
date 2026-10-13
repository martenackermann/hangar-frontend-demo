import type { ServiceRequestDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { DeploymentTab } from '@/modules/field/components/deployment-tab'

const VISIBLE = new Set(['provided', 'shipped', 'completed', 'reschedule_needed'])

const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'deployment',
  label: 'Deployment',
  order: 80,
  isVisible: (sr) => VISIBLE.has(sr.status) || (sr.status === 'cancelled' && sr.deviation !== null),
  component: ({ entity }) => <DeploymentTab sr={entity} />,
}
export default tab
