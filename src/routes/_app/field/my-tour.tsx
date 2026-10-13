import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * My tour (SCREENS.md). Owner: H4 (Field service).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/field/my-tour')({
  beforeLoad: requirePermission('tours.execute_own'),
  staticData: { title: 'My tour' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="My tour"
      owner="H4"
      purpose="The technician's day: stops in order, navigate, call, open the deployment."
    />
  )
}
