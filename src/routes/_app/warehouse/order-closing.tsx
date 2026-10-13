import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Order closing (SCREENS.md). Owner: H3 (Staging & Fulfilment).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/warehouse/order-closing')({
  beforeLoad: requirePermission('sr.read'),
  staticData: { title: 'Order closing' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Order closing"
      owner="H3"
      purpose="Confirm software checklists and close orders so they are ready for picking."
    />
  )
}
