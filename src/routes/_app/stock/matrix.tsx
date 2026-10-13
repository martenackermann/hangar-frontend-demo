import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Stock matrix (SCREENS.md). Owner: H5 (Stock, Inventory & Dashboard).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/stock/matrix')({
  beforeLoad: requirePermission('stock.read'),
  staticData: { title: 'Stock matrix' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Stock matrix"
      owner="H5"
      purpose="Stock vs demand per article and hub; maintain buffers; start call-off orders."
    />
  )
}
