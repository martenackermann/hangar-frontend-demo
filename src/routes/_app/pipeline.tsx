import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Pipeline board (SCREENS.md). Owner: H1 (Requests & Comms).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/pipeline')({
  beforeLoad: requirePermission('sr.read'),
  staticData: { title: 'Pipeline board' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Pipeline board"
      owner="H1"
      purpose="See the whole rollout at a glance: where every request sits, what is stuck, what to do next."
    />
  )
}
