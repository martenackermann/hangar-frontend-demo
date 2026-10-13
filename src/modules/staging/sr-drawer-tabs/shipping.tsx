import type { ServiceRequestDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const ShippingTab = lazyNamed(
  () => import('@/modules/staging/components/shipping-tab'),
  'ShippingTab',
)

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
