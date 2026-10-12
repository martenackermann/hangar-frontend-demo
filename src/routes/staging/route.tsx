import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/lib/auth/guards'

/** Layout route of the `staging` module: guards every /staging/* page. Owner: slice H3 (Staging & Fulfilment). */
export const Route = createFileRoute('/staging')({
  beforeLoad: requirePermission('staging:read'),
  staticData: { title: 'Staging' },
})
