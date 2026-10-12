import { Warehouse } from 'lucide-react'
import type { NavEntry } from '@/lib/nav/types'

/** PLACEHOLDER (phase 2a): slice H5 (Stock/Inventory/Dashboard) replaces these entries per SCREENS.md. */
export const nav: NavEntry[] = [
  {
    id: 'stock.index',
    label: 'Stock',
    to: '/stock',
    group: 'logistics',
    icon: Warehouse,
    permission: 'stock:read',
    shortcut: 'g k',
  },
]
