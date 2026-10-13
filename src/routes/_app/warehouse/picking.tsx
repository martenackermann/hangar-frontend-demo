import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Picking (SCREENS.md). Owner: H3 (Staging & Fulfilment).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/warehouse/picking')({
  beforeLoad: requirePermission('sr.read'),
  staticData: { title: 'Picking' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Picking"
      owner="H3"
      purpose="Hand prepared hardware to technicians for a date."
    />
  )
}
