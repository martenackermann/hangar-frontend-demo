import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Inventory scan station (SCREENS.md). Owner: H5 (Stock, Inventory & Dashboard).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/stock/inventory/$inventoryId')({
  beforeLoad: requirePermission('inventory.read'),
  staticData: { title: 'Inventory scan station' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Inventory scan station"
      owner="H5"
      purpose="Scan every device at the site and reconcile against the expected set."
    />
  )
}
