import { Boxes, FileX, Gauge, Laptop, ScanLine, Send } from 'lucide-react'
import type { NavEntry } from '@/lib/nav/types'

/**
 * Navigation entries of this module (SCREENS.md §1.2), owned by the `stock` slice.
 * Pre-filled by the foundation from the spec; keep ids and shortcuts unique (a test checks).
 */
export const nav: NavEntry[] = [
  {
    id: 'stock.dashboard',
    label: 'Dashboard',
    to: '/dashboard',
    group: 'overview',
    icon: Gauge,
    permission: 'dashboard.read',
    shortcut: 'g d',
    order: 20,
  },
  {
    id: 'stock.stock-matrix',
    label: 'Stock matrix',
    to: '/stock/matrix',
    group: 'stock',
    icon: Boxes,
    permission: 'stock.read',
    shortcut: 'g x',
    order: 10,
  },
  {
    id: 'stock.stock-call-off-orders',
    label: 'Call-off orders',
    to: '/stock/call-off-orders',
    group: 'stock',
    icon: Send,
    permission: 'stock.read',
    order: 20,
  },
  {
    id: 'stock.stock-inventory',
    label: 'Inventory',
    to: '/stock/inventory',
    group: 'stock',
    icon: ScanLine,
    permission: 'inventory.read',
    shortcut: 'g r',
    order: 30,
  },
  {
    id: 'stock.stock-assets',
    label: 'Assets',
    to: '/stock/assets',
    group: 'stock',
    icon: Laptop,
    permission: 'stock.read',
    shortcut: 'g a',
    order: 40,
  },
  {
    id: 'stock.stock-deactivation',
    label: 'Deactivation import',
    to: '/stock/deactivation',
    group: 'stock',
    icon: FileX,
    permission: 'assets.deactivate',
    order: 50,
  },
]
