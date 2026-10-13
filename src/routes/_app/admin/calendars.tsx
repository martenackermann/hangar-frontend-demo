import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/lib/auth/guards'
import { CalendarsPage } from '@/modules/field/components/calendars-page'

/** Calendars (SCREENS.md §9.3). Owner: H4 (Field service). Edit with `master.manage`. */
export const Route = createFileRoute('/_app/admin/calendars')({
  beforeLoad: requirePermission('master.read'),
  staticData: { title: 'Calendars' },
  component: CalendarsPage,
})
