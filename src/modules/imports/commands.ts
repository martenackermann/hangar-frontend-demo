import { FileUp, Package, UserPlus } from 'lucide-react'
import type { CommandDescriptor } from '@/lib/registry'

/** ⌘K actions contributed by H2 (SCREENS.md §1.3), shown only with `permission`. */
export const commands: CommandDescriptor[] = [
  {
    id: 'imports.new-import',
    label: 'New import…',
    icon: FileUp,
    permission: 'imports.create',
    keywords: ['upload', 'csv', 'xlsx', 'itsm', 'export', 'import'],
    run: ({ navigate, close }) => {
      close()
      navigate('/data/imports?upload=true')
    },
  },
  {
    id: 'imports.new-article',
    label: 'New article…',
    icon: Package,
    permission: 'master.manage',
    keywords: ['catalogue', 'device type', 'model'],
    run: ({ navigate, close }) => {
      close()
      navigate('/admin/articles?article=new')
    },
  },
  {
    id: 'imports.new-user',
    label: 'New user…',
    icon: UserPlus,
    permission: 'users.manage',
    keywords: ['account', 'admin'],
    run: ({ navigate, close }) => {
      close()
      navigate('/admin/users')
    },
  },
]
