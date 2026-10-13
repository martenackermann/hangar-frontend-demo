import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Dashboard (SCREENS.md). Owner: H5 (Stock, Inventory & Dashboard).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/dashboard')({
  beforeLoad: requirePermission('dashboard.read'),
  staticData: { title: 'Dashboard' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Dashboard"
      owner="H5"
      purpose="KPIs and trends for the rollout, stock and data freshness."
    />
  )
}
