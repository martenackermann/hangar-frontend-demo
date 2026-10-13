import { useMemo } from 'react'
import { useMe } from '@/lib/auth/store'
import { filterNavEntries, getAllNavEntries, groupNavEntries, type NavGroup } from './registry'
import type { NavEntry } from './types'

const ALL_ENTRIES = getAllNavEntries()

export interface Navigation {
  /** Entries the current user may see, in display order (rail, ⌘K "Go to", g-shortcuts). */
  entries: NavEntry[]
  /** The same entries grouped for the rail; empty groups dropped; Field first for technicians. */
  groups: NavGroup[]
}

/** Aggregates every module's `nav.ts` and filters it by `GET /me.permissions`. */
export function useNavigation(): Navigation {
  const me = useMe()
  const permissions = me?.permissions
  const role = me?.role
  return useMemo(() => {
    const entries = filterNavEntries(ALL_ENTRIES, permissions)
    const groups = groupNavEntries(entries, role)
    return { entries: groups.flatMap((group) => group.entries), groups }
  }, [permissions, role])
}
