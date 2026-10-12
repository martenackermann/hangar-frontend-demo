import type { LucideIcon } from 'lucide-react'
import type { Permission } from '@/lib/auth/permissions'
import type { FileRoutesByTo } from '@/routeTree.gen'

/** Any concrete route path of the app (type-checked against the generated route tree). */
export type AppPath = keyof FileRoutesByTo

/**
 * Sidebar groups, in display order.
 * PLACEHOLDER (phase 2a): phase 2b aligns ids/labels with SCREENS.md.
 */
export const NAV_GROUPS = [
  { id: 'overview', label: 'Overview' },
  { id: 'requests', label: 'Requests' },
  { id: 'staging', label: 'Staging & fulfilment' },
  { id: 'field', label: 'Field service' },
  { id: 'logistics', label: 'Stock & logistics' },
  { id: 'data', label: 'Data' },
] as const

export type NavGroupId = (typeof NAV_GROUPS)[number]['id']

/** One navigation entry, declared in `src/modules/<module>/nav.ts`. */
export interface NavEntry {
  /** Unique across the app, e.g. `requests.service-requests`. */
  id: string
  label: string
  to: AppPath
  group: NavGroupId
  icon?: LucideIcon
  /** Entry is hidden unless the user has every listed permission. */
  permission?: Permission | readonly Permission[]
  /** Key sequence, e.g. `g r` (press g, then r). Must be unique; see CONVENTIONS.md. */
  shortcut?: string
  /** Sort order inside the group (ascending, default 100). */
  order?: number
  /** Short hint for the command palette. */
  description?: string
  /** Extra search terms for the command palette. */
  keywords?: readonly string[]
}
