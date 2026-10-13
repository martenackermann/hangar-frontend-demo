import { CalendarDays, Navigation, Route } from 'lucide-react'
import type { NavEntry } from '@/lib/nav/types'

/**
 * Navigation entries of this module (SCREENS.md §1.2), owned by the `field` slice.
 * Pre-filled by the foundation from the spec; keep ids and shortcuts unique (a test checks).
 */
export const nav: NavEntry[] = [
  {
    id: 'field.field-tour-planner',
    label: 'Tour planner',
    to: '/field/tour-planner',
    group: 'field',
    icon: Route,
    permission: 'tours.read',
    shortcut: 'g t',
    order: 20,
  },
  {
    id: 'field.field-my-tour',
    label: 'My tour',
    to: '/field/my-tour',
    group: 'field',
    icon: Navigation,
    permission: 'tours.execute_own',
    shortcut: 'g m',
    order: 10,
  },
  {
    id: 'field.admin-calendars',
    label: 'Calendars',
    to: '/admin/calendars',
    group: 'admin',
    icon: CalendarDays,
    permission: 'master.read',
    order: 30,
  },
]
