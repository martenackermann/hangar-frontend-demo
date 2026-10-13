import { CalendarClock, Inbox, Kanban, Mail, Settings2 } from 'lucide-react'
import type { NavEntry } from '@/lib/nav/types'

/**
 * Navigation entries of this module (SCREENS.md §1.2), owned by the `requests` slice.
 * Pre-filled by the foundation from the spec; keep ids and shortcuts unique (a test checks).
 */
export const nav: NavEntry[] = [
  {
    id: 'requests.pipeline',
    label: 'Pipeline',
    to: '/pipeline',
    group: 'overview',
    icon: Kanban,
    permission: 'sr.read',
    shortcut: 'g p',
    order: 10,
  },
  {
    id: 'requests.service-requests',
    label: 'Service requests',
    to: '/service-requests',
    group: 'requests',
    icon: Inbox,
    permission: 'sr.read',
    shortcut: 'g s',
    order: 10,
  },
  {
    id: 'requests.lease-returns',
    label: 'Lease returns',
    to: '/lease-returns',
    group: 'requests',
    icon: CalendarClock,
    permission: 'lease.read',
    shortcut: 'g l',
    order: 20,
  },
  {
    id: 'requests.communications',
    label: 'Communications',
    to: '/communications',
    group: 'requests',
    icon: Mail,
    permission: 'comms.read',
    shortcut: 'g c',
    order: 30,
  },
  {
    id: 'requests.admin-dispatch-settings',
    label: 'Dispatch settings',
    to: '/admin/dispatch-settings',
    group: 'admin',
    icon: Settings2,
    permission: 'comms.read',
    order: 50,
  },
]
