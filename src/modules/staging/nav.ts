import { ClipboardCheck, PackageCheck, ScanBarcode, Truck, Wrench } from 'lucide-react'
import type { NavEntry } from '@/lib/nav/types'

/**
 * Navigation entries of this module (SCREENS.md §1.2), owned by the `staging` slice.
 * Pre-filled by the foundation from the spec; keep ids and shortcuts unique (a test checks).
 */
export const nav: NavEntry[] = [
  {
    id: 'staging.warehouse-installation-places',
    label: 'Installation places',
    to: '/warehouse/installation-places',
    group: 'warehouse',
    icon: ScanBarcode,
    permission: 'staging.scan',
    order: 10,
  },
  {
    id: 'staging.warehouse-personalization',
    label: 'Personalization',
    to: '/warehouse/personalization',
    group: 'warehouse',
    icon: Wrench,
    permission: 'sr.read',
    shortcut: 'g w',
    order: 20,
  },
  {
    id: 'staging.warehouse-order-closing',
    label: 'Order closing',
    to: '/warehouse/order-closing',
    group: 'warehouse',
    icon: ClipboardCheck,
    permission: 'sr.read',
    shortcut: 'g o',
    order: 30,
  },
  {
    id: 'staging.warehouse-picking',
    label: 'Picking',
    to: '/warehouse/picking',
    group: 'warehouse',
    icon: PackageCheck,
    permission: 'sr.read',
    shortcut: 'g k',
    order: 40,
  },
  {
    id: 'staging.warehouse-parcel-shipping',
    label: 'Parcel shipping',
    to: '/warehouse/parcel-shipping',
    group: 'warehouse',
    icon: Truck,
    permission: 'sr.read',
    shortcut: 'g h',
    order: 50,
  },
]
