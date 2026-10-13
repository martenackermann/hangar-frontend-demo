import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/lib/auth/guards'
import { DispatchSettingsPage } from '@/modules/requests/components/dispatch-settings-page'

/** Dispatch settings (SCREENS.md §9.5). Owner: H1 (Requests & Comms). Edit needs `comms.settings`. */
export const Route = createFileRoute('/_app/admin/dispatch-settings')({
  beforeLoad: requirePermission('comms.read'),
  staticData: { title: 'Dispatch settings' },
  component: DispatchSettingsPage,
})
