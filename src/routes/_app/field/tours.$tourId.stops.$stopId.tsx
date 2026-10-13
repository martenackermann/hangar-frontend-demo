import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Deployment (SCREENS.md). Owner: H4 (Field service).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/field/tours/$tourId/stops/$stopId')({
  beforeLoad: requirePermission('tours.execute_own'),
  staticData: { title: 'Deployment' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Deployment"
      owner="H4"
      purpose="On-site execution of one stop: instructions, device scans, deviation, complete or reschedule."
    />
  )
}
