import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Communications (SCREENS.md). Owner: H1 (Requests & Comms).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/communications')({
  beforeLoad: requirePermission('comms.read'),
  staticData: { title: 'Communications' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Communications"
      owner="H1"
      purpose="Audit every mail, run or preview the daily dispatch, browse templates."
    />
  )
}
