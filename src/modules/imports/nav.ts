import { Crown, FileUp, Map, Package, Users } from 'lucide-react'
import type { NavEntry } from '@/lib/nav/types'

/**
 * Navigation entries of this module (SCREENS.md §1.2), owned by the `imports` slice.
 * Pre-filled by the foundation from the spec; keep ids and shortcuts unique (a test checks).
 */
export const nav: NavEntry[] = [
  {
    id: 'imports.data-imports',
    label: 'Imports',
    to: '/data/imports',
    group: 'data',
    icon: FileUp,
    permission: 'imports.read',
    shortcut: 'g i',
    order: 10,
  },
  {
    id: 'imports.admin-articles',
    label: 'Articles',
    to: '/admin/articles',
    group: 'admin',
    icon: Package,
    permission: 'master.read',
    order: 10,
  },
  {
    id: 'imports.admin-regions',
    label: 'Regions',
    to: '/admin/regions',
    group: 'admin',
    icon: Map,
    permission: 'master.read',
    order: 20,
  },
  {
    id: 'imports.admin-vip-list',
    label: 'VIP list',
    to: '/admin/vip-list',
    group: 'admin',
    icon: Crown,
    permission: 'master.read',
    order: 40,
  },
  {
    id: 'imports.admin-users',
    label: 'Users',
    to: '/admin/users',
    group: 'admin',
    icon: Users,
    permission: 'users.manage',
    order: 60,
  },
]
