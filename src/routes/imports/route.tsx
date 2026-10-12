import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/lib/auth/guards'

/** Layout route of the `imports` module: guards every /imports/* page. Owner: slice H2 (Import & Master data). */
export const Route = createFileRoute('/imports')({
  beforeLoad: requirePermission('imports:read'),
  staticData: { title: 'Imports' },
})
