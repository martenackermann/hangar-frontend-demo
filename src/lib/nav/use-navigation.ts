import { useMemo } from 'react'
import { useCurrentUser } from '@/lib/auth/store'
import { filterNavEntries, getAllNavEntries, groupNavEntries, type NavGroup } from './registry'
import type { NavEntry } from './types'

const ALL_ENTRIES = getAllNavEntries()

export interface Navigation {
  /** Entries the current user may see, in display order (sidebar, command palette, shortcuts). */
  entries: NavEntry[]
  /** The same entries grouped for the sidebar; empty groups are dropped. */
  groups: NavGroup[]
}

/** Aggregates every module's `nav.ts` and filters it by the signed-in user's permissions. */
export function useNavigation(): Navigation {
  const permissions = useCurrentUser()?.permissions
  return useMemo(() => {
    const entries = filterNavEntries(ALL_ENTRIES, permissions)
    return { entries, groups: groupNavEntries(entries) }
  }, [permissions])
}
