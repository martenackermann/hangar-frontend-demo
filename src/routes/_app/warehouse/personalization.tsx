import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Personalization (SCREENS.md). Owner: H3 (Staging & Fulfilment).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/warehouse/personalization')({
  beforeLoad: requirePermission('sr.read'),
  staticData: { title: 'Personalization' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Personalization"
      owner="H3"
      purpose="Work the staging queue in appointment order: claim, assign devices FIFO by scanning, finish."
    />
  )
}
