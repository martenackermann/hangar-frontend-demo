import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Lease returns (SCREENS.md). Owner: H1 (Requests & Comms).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/lease-returns')({
  beforeLoad: requirePermission('lease.read'),
  staticData: { title: 'Lease returns' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Lease returns"
      owner="H1"
      purpose="Nudge users of expiring leased devices to order replacements; track links to requests."
    />
  )
}
