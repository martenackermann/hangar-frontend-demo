import { FileUp } from 'lucide-react'
import type { NavEntry } from '@/lib/nav/types'

/** PLACEHOLDER (phase 2a): slice H2 (Import & Master data) replaces these entries per SCREENS.md. */
export const nav: NavEntry[] = [
  {
    id: 'imports.index',
    label: 'Imports',
    to: '/imports',
    group: 'data',
    icon: FileUp,
    permission: 'imports:read',
    shortcut: 'g i',
  },
]
