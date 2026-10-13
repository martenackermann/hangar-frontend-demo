import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Call-off orders (SCREENS.md). Owner: H5 (Stock, Inventory & Dashboard).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/stock/call-off-orders/')({
  beforeLoad: requirePermission('stock.read'),
  staticData: { title: 'Call-off orders' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Call-off orders"
      owner="H5"
      purpose="Replenishment orders per hub to Initech Logistics."
    />
  )
}
