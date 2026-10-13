import type { ServiceRequestDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { ShippingTab } from '@/modules/staging/components/shipping-tab'

const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'shipping',
  label: 'Shipping',
  order: 70,
  permission: 'sr.read',
  isVisible: (sr) =>
    sr.deliveryType === 'parcel_to_user' ||
    sr.deliveryType === 'parcel_to_pickup_point' ||
    sr.milestones.shippedAt !== null,
  component: ShippingTab,
}

export default tab
