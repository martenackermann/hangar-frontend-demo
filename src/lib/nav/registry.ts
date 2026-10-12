import { hasPermission } from '@/lib/auth/permissions'
import { NAV_GROUPS, type NavEntry, type NavGroupId } from './types'

/** Every `src/modules/<module>/nav.ts` exports `nav: NavEntry[]`. Collected at build time. */
const navModules = import.meta.glob<readonly NavEntry[]>('/src/modules/*/nav.ts', {
  eager: true,
  import: 'nav',
})

const DEFAULT_ORDER = 100

function byOrder(a: NavEntry, b: NavEntry): number {
  return (a.order ?? DEFAULT_ORDER) - (b.order ?? DEFAULT_ORDER) || a.label.localeCompare(b.label)
}

/** All entries of all modules, sorted by group order, then entry order. */
export function getAllNavEntries(): NavEntry[] {
  const groupIndex = new Map<NavGroupId, number>(NAV_GROUPS.map((g, i) => [g.id, i]))
  return Object.values(navModules)
    .flat()
    .sort(
      (a, b) =>
        (groupIndex.get(a.group) ?? NAV_GROUPS.length) -
          (groupIndex.get(b.group) ?? NAV_GROUPS.length) || byOrder(a, b),
    )
}

export function filterNavEntries(
  entries: readonly NavEntry[],
  permissions: readonly string[] | undefined,
): NavEntry[] {
  return entries.filter((entry) => hasPermission(permissions, entry.permission))
}

export interface NavGroup {
  id: NavGroupId
  label: string
  entries: NavEntry[]
}

export function groupNavEntries(entries: readonly NavEntry[]): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    entries: entries.filter((entry) => entry.group === group.id),
  })).filter((group) => group.entries.length > 0)
}
