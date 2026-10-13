import type { Role } from '@/lib/api/types'
import { hasAnyPermission, hasPermission } from '@/lib/auth/permissions'
import { NAV_GROUP_PERMISSIONS, NAV_GROUPS, type NavEntry, type NavGroupId } from './types'

/** Every `src/modules/<module>/nav.ts` exports `nav: NavEntry[]` (SPEC_RESOLUTIONS #19). */
const navModules = import.meta.glob<readonly NavEntry[]>(
  '/src/modules/{requests,imports,staging,field,stock}/nav.ts',
  { eager: true, import: 'nav' },
)

const DEFAULT_ORDER = 100

function byOrder(a: NavEntry, b: NavEntry): number {
  return (a.order ?? DEFAULT_ORDER) - (b.order ?? DEFAULT_ORDER) || a.label.localeCompare(b.label)
}

/** Group order; technicians see Field first (SCREENS.md §1.2). */
export function groupOrder(role: Role | undefined): NavGroupId[] {
  const ids: NavGroupId[] = NAV_GROUPS.map((g) => g.id)
  return role === 'technician' ? ['field', ...ids.filter((id) => id !== 'field')] : ids
}

/** All entries of all modules, sorted by group then entry order. */
export function getAllNavEntries(): NavEntry[] {
  const index = new Map<NavGroupId, number>(NAV_GROUPS.map((g, i) => [g.id, i]))
  return Object.keys(navModules)
    .sort()
    .flatMap((path) => navModules[path] ?? [])
    .sort((a, b) => (index.get(a.group) ?? 99) - (index.get(b.group) ?? 99) || byOrder(a, b))
}

/** Entries the user may see: entry permission + group rule (Admin needs master/users.manage). */
export function filterNavEntries(
  entries: readonly NavEntry[],
  permissions: readonly string[] | undefined,
): NavEntry[] {
  return entries.filter((entry) => {
    const groupRule = NAV_GROUP_PERMISSIONS[entry.group]
    if (groupRule && !hasAnyPermission(permissions, groupRule)) return false
    return hasPermission(permissions, entry.permission)
  })
}

export interface NavGroup {
  id: NavGroupId
  label: string
  entries: NavEntry[]
}

export function groupNavEntries(entries: readonly NavEntry[], role?: Role): NavGroup[] {
  const labels = new Map<NavGroupId, string>(NAV_GROUPS.map((g) => [g.id, g.label]))
  return groupOrder(role)
    .map((id) => ({
      id,
      label: labels.get(id) ?? id,
      entries: entries.filter((entry) => entry.group === id),
    }))
    .filter((group) => group.entries.length > 0)
}
