import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Deactivation import (SCREENS.md). Owner: H5 (Stock, Inventory & Dashboard).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/stock/deactivation')({
  beforeLoad: requirePermission('assets.deactivate'),
  staticData: { title: 'Deactivation import' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Deactivation import"
      owner="H5"
      purpose="Record devices that left the fleet in bulk."
    />
  )
}
