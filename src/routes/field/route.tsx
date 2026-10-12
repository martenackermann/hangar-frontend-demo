import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/lib/auth/guards'

/** Layout route of the `field` module: guards every /field/* page. Owner: slice H4 (Field service). */
export const Route = createFileRoute('/field')({
  beforeLoad: requirePermission('field:read'),
  staticData: { title: 'Field service' },
})
