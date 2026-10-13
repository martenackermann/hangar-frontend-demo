import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Inventory (SCREENS.md). Owner: H5 (Stock, Inventory & Dashboard).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/stock/inventory/')({
  beforeLoad: requirePermission('inventory.read'),
  staticData: { title: 'Inventory' },
  component: Placeholder,
})

function Placeholder() {
  return <RoutePlaceholder title="Inventory" owner="H5" purpose="Run stock-takes per site." />
}
