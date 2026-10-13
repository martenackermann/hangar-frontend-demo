import type { LucideIcon } from 'lucide-react'
import type { Permission } from '@/lib/auth/permissions'
import type { FileRoutesByTo } from '@/routeTree.gen'

/** Any concrete route path of the app (type-checked against the generated route tree). */
export type AppPath = keyof FileRoutesByTo

/** Sidebar groups in display order (SCREENS.md §1.2). */
export const NAV_GROUPS = [
  { id: 'overview', label: 'Overview' },
  { id: 'requests', label: 'Requests' },
  { id: 'warehouse', label: 'Warehouse' },
  { id: 'field', label: 'Field' },
  { id: 'stock', label: 'Stock' },
  { id: 'data', label: 'Data' },
  /** Visible only with `master.manage` or `users.manage` (SPEC_RESOLUTIONS #36). */
  { id: 'admin', label: 'Admin' },
] as const

export type NavGroupId = (typeof NAV_GROUPS)[number]['id']

/** Group-level visibility rules: any of these permissions. */
export const NAV_GROUP_PERMISSIONS: Partial<Record<NavGroupId, readonly Permission[]>> = {
  admin: ['master.manage', 'users.manage'],
}

/** One navigation entry, declared in `src/modules/<module>/nav.ts`. */
export interface NavEntry {
  /** Unique across the app, e.g. `requests.service-requests`. */
  id: string
  label: string
  to: AppPath
  group: NavGroupId
  icon: LucideIcon
  /** Entry is hidden unless the user has every listed permission. */
  permission?: Permission | readonly Permission[]
  /** Key sequence, e.g. `g s` (SCREENS.md §1.4). Must be unique; a unit test checks this. */
  shortcut?: string
  /** Sort order inside the group (ascending, default 100). */
  order?: number
  /** Extra search terms for the command palette. */
  keywords?: readonly string[]
}
