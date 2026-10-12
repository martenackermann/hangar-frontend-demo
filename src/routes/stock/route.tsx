import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/lib/auth/guards'

/** Layout route of the `stock` module: guards every /stock/* page. Owner: slice H5 (Stock/Inventory/Dashboard). */
export const Route = createFileRoute('/stock')({
  beforeLoad: requirePermission('stock:read'),
  staticData: { title: 'Stock' },
})
