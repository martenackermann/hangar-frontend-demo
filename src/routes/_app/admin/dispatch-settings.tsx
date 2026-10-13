import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Dispatch settings (SCREENS.md). Owner: H1 (Requests & Comms).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/admin/dispatch-settings')({
  beforeLoad: requirePermission('comms.read'),
  staticData: { title: 'Dispatch settings' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Dispatch settings"
      owner="H1"
      purpose="Timing and switches of the automatic communication chains."
    />
  )
}
