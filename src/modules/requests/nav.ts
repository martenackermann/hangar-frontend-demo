import { ClipboardList } from 'lucide-react'
import type { NavEntry } from '@/lib/nav/types'

/** PLACEHOLDER (phase 2a): slice H1 (Requests & Comms) replaces these entries per SCREENS.md. */
export const nav: NavEntry[] = [
  {
    id: 'requests.index',
    label: 'Requests',
    to: '/requests',
    group: 'requests',
    icon: ClipboardList,
    permission: 'requests:read',
    shortcut: 'g r',
  },
]
