import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Tour planner (SCREENS.md). Owner: H4 (Field service).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/field/tour-planner')({
  beforeLoad: requirePermission('tours.read'),
  staticData: { title: 'Tour planner' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Tour planner"
      owner="H4"
      purpose="Plan technician tours per calendar and day; match appointments; trigger the sync."
    />
  )
}
