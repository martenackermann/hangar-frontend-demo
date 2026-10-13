import { ClipboardCheck, PackageCheck, ScanBarcode, Truck, Wrench } from 'lucide-react'
import type { CommandDescriptor } from '@/lib/registry'

/** ⌘K actions contributed by H3 (SCREENS.md §1.3), shown only with `permission`. */
export const commands: CommandDescriptor[] = [
  {
    id: 'staging.scan-installation-place',
    label: 'Scan installation place',
    icon: ScanBarcode,
    permission: 'staging.scan',
    keywords: ['installation place station', 'shelve', 'place', 'scan', 'warehouse'],
    run: ({ navigate }) => navigate('/warehouse/installation-places'),
  },
  {
    id: 'staging.my-personalization',
    label: 'Continue my personalization',
    icon: Wrench,
    permission: 'staging.personalize',
    keywords: ['claimed', 'mine', 'staging', 'assign devices'],
    run: ({ navigate }) => navigate('/warehouse/personalization?queue=mine'),
  },
  {
    id: 'staging.orders-ready-to-close',
    label: 'Orders ready to close',
    icon: ClipboardCheck,
    permission: 'staging.close',
    keywords: ['order closing', 'software checklist complete'],
    run: ({ navigate }) => navigate('/warehouse/order-closing?checklistComplete=true'),
  },
  {
    id: 'staging.pick-today',
    label: 'Pick for today’s tours',
    icon: PackageCheck,
    permission: 'fulfilment.pick',
    keywords: ['picking', 'technician', 'hand over'],
    run: ({ navigate }) => navigate('/warehouse/picking'),
  },
  {
    id: 'staging.pack-parcels',
    label: 'Pack and ship parcels',
    icon: Truck,
    permission: 'fulfilment.ship',
    keywords: ['parcel shipping', 'label', 'carrier', 'tracking'],
    run: ({ navigate }) => navigate('/warehouse/parcel-shipping'),
  },
]
