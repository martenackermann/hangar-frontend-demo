import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Calendars (SCREENS.md). Owner: H4 (Field service).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/admin/calendars')({
  beforeLoad: requirePermission('master.read'),
  staticData: { title: 'Calendars' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Calendars"
      owner="H4"
      purpose="Booking calendars (tour routes) synced from the booking provider."
    />
  )
}
