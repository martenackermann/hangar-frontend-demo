import { LayoutDashboard } from 'lucide-react'
import type { NavEntry } from '@/lib/nav/types'

/** PLACEHOLDER (phase 2a): phase 2b (foundation) replaces these entries per SCREENS.md. */
export const nav: NavEntry[] = [
  {
    id: 'core.index',
    label: 'Home',
    to: '/',
    group: 'overview',
    icon: LayoutDashboard,
    shortcut: 'g h',
  },
]
