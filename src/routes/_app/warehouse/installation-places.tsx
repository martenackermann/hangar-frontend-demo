import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Installation places (SCREENS.md). Owner: H3 (Staging & Fulfilment).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/warehouse/installation-places')({
  beforeLoad: requirePermission('staging.scan'),
  staticData: { title: 'Installation places' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Installation places"
      owner="H3"
      purpose="Shelve incoming devices: scan a serial and an installation place."
    />
  )
}
