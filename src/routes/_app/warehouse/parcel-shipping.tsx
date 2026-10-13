import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Parcel shipping (SCREENS.md). Owner: H3 (Staging & Fulfilment).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/warehouse/parcel-shipping')({
  beforeLoad: requirePermission('sr.read'),
  staticData: { title: 'Parcel shipping' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Parcel shipping"
      owner="H3"
      purpose="Pack parcel orders by scanning, create carrier labels, send tracking information."
    />
  )
}
