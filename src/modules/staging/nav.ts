import { PackageCheck } from 'lucide-react'
import type { NavEntry } from '@/lib/nav/types'

/** PLACEHOLDER (phase 2a): slice H3 (Staging & Fulfilment) replaces these entries per SCREENS.md. */
export const nav: NavEntry[] = [
  {
    id: 'staging.index',
    label: 'Staging',
    to: '/staging',
    group: 'staging',
    icon: PackageCheck,
    permission: 'staging:read',
    shortcut: 'g s',
  },
]
