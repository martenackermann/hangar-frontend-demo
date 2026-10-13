import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Users (SCREENS.md). Owner: H2 (Import & Master data).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/admin/users')({
  beforeLoad: requirePermission('users.manage'),
  staticData: { title: 'Users' },
  component: Placeholder,
})

function Placeholder() {
  return <RoutePlaceholder title="Users" owner="H2" purpose="Users, roles and home sites." />
}
