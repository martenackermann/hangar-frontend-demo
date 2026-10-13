import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Regions (SCREENS.md). Owner: H2 (Import & Master data).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/admin/regions')({
  beforeLoad: requirePermission('master.read'),
  staticData: { title: 'Regions' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Regions"
      owner="H2"
      purpose="Delivery regions, region rules and the resolver tester."
    />
  )
}
