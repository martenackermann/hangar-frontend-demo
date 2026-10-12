import { Truck } from 'lucide-react'
import type { NavEntry } from '@/lib/nav/types'

/** PLACEHOLDER (phase 2a): slice H4 (Field service) replaces these entries per SCREENS.md. */
export const nav: NavEntry[] = [
  {
    id: 'field.index',
    label: 'Field service',
    to: '/field',
    group: 'field',
    icon: Truck,
    permission: 'field:read',
    shortcut: 'g f',
  },
]
