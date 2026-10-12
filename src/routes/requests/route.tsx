import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/lib/auth/guards'

/** Layout route of the `requests` module: guards every /requests/* page. Owner: slice H1 (Requests & Comms). */
export const Route = createFileRoute('/requests')({
  beforeLoad: requirePermission('requests:read'),
  staticData: { title: 'Requests' },
})
