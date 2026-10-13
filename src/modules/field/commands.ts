import { Navigation, RefreshCw } from 'lucide-react'
import { notify } from '@/components/ui/toast'
import { isApiError } from '@/lib/api/errors'
import type { CommandDescriptor } from '@/lib/registry'
import { startAppointmentSync } from './api'

/** ⌘K actions contributed by H4 (SCREENS.md §1.3), shown only with `permission`. */
export const commands: CommandDescriptor[] = [
  {
    id: 'field.sync-appointments',
    label: 'Sync appointments now',
    icon: RefreshCw,
    permission: 'appointments.manage',
    keywords: ['booking', 'calendar', 'appointment', 'sync'],
    run: async ({ queryClient, close }) => {
      close()
      try {
        await startAppointmentSync(queryClient)
      } catch (error) {
        notify.error(isApiError(error) ? error.title : 'The sync could not start', {
          description: isApiError(error) ? error.detail : undefined,
        })
      }
    },
  },
  {
    id: 'field.open-my-tour',
    label: 'Open my tour today',
    icon: Navigation,
    permission: 'tours.execute_own',
    keywords: ['tour', 'stops', 'technician', 'today'],
    run: ({ navigate, close }) => {
      close()
      navigate('/field/my-tour')
    },
  },
]
