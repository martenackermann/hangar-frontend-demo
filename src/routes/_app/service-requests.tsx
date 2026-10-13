import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Service requests (SCREENS.md). Owner: H1 (Requests & Comms).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/service-requests')({
  beforeLoad: requirePermission('sr.read'),
  staticData: { title: 'Service requests' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Service requests"
      owner="H1"
      purpose="Find, filter and act on service requests; bulk communication actions."
    />
  )
}
