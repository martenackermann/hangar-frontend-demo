import type { ServiceRequestDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { StagingTab } from '@/modules/staging/components/staging-tab'
import { BEFORE_BOOKING } from '@/modules/staging/statuses'

const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'staging',
  label: 'Staging',
  order: 60,
  permission: 'sr.read',
  isVisible: (sr) => !BEFORE_BOOKING.includes(sr.status) || sr.claimedAt !== null,
  component: StagingTab,
}

export default tab
