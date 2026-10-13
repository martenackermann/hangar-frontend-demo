import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * VIP list (SCREENS.md). Owner: H2 (Import & Master data).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/admin/vip-list')({
  beforeLoad: requirePermission('master.read'),
  staticData: { title: 'VIP list' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="VIP list"
      owner="H2"
      purpose="Employees handled personally: no automatic mails, hidden from default lists."
    />
  )
}
