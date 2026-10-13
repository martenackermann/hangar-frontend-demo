import type { ServiceRequestDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const DeploymentTab = lazyNamed(
  () => import('@/modules/field/components/deployment-tab'),
  'DeploymentTab',
)

const VISIBLE = new Set(['provided', 'shipped', 'completed', 'reschedule_needed'])

const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'deployment',
  label: 'Deployment',
  order: 80,
  isVisible: (sr) => VISIBLE.has(sr.status) || (sr.status === 'cancelled' && sr.deviation !== null),
  preload: DeploymentTab.preload,
  component: ({ entity }) => <DeploymentTab sr={entity} />,
}
export default tab
