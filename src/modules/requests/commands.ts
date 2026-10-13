import {
  AlertTriangle,
  CalendarClock,
  CalendarX,
  Mail,
  MailCheck,
  Send,
  Settings2,
  Siren,
} from 'lucide-react'
import { addDays, businessToday } from '@/lib/format'
import type { CommandDescriptor } from '@/lib/registry'
import { startDispatch } from './dispatch'

/**
 * ⌘K actions contributed by H1 (SCREENS.md §1.3), shown only with `permission`. Jumping to a
 * single SR / lease return by number or asset tag is the palette's exact-match search (core).
 */
export const commands: CommandDescriptor[] = [
  {
    id: 'requests.dispatch-dry-run',
    label: 'Dispatch dry run',
    icon: MailCheck,
    permission: 'comms.dispatch',
    keywords: ['preview', 'due mails', 'comms', 'chain'],
    run: ({ navigate }) => navigate('/communications?view=dispatch-runs&preview=true'),
  },
  {
    id: 'requests.send-due-mails',
    label: 'Send due mails now',
    icon: Send,
    permission: 'comms.dispatch',
    keywords: ['dispatch', 'run', 'chain', 'reminders', 'invitations'],
    run: ({ queryClient }) => {
      void startDispatch(queryClient)
    },
  },
  {
    id: 'requests.escalated',
    label: 'Show escalated service requests',
    icon: Siren,
    permission: 'sr.read',
    keywords: ['escalation', 'sr'],
    run: ({ navigate }) => navigate('/service-requests?status=escalated'),
  },
  {
    id: 'requests.needs-attention',
    label: 'Show service requests that need attention',
    icon: AlertTriangle,
    permission: 'sr.read',
    keywords: ['attention', 'problems', 'region unresolved', 'missing email'],
    run: ({ navigate }) => navigate('/service-requests?needsAttention=true'),
  },
  {
    id: 'requests.lease-due',
    label: 'Show lease returns due in 30 days',
    icon: CalendarClock,
    permission: 'lease.read',
    keywords: ['lease', 'retirement', 'expiring'],
    run: ({ navigate }) => {
      const today = businessToday()
      navigate(`/lease-returns?retirementFrom=${today}&retirementTo=${addDays(today, 30)}`)
    },
  },
  {
    id: 'requests.lease-overdue',
    label: 'Show overdue lease returns',
    icon: CalendarX,
    permission: 'lease.read',
    keywords: ['lease', 'retirement passed', 'overdue'],
    run: ({ navigate }) => navigate(`/lease-returns?retirementTo=${addDays(businessToday(), -1)}`),
  },
  {
    id: 'requests.failed-mails',
    label: 'Show failed mails',
    icon: Mail,
    permission: 'comms.read',
    keywords: ['mail log', 'bounce', 'error'],
    run: ({ navigate }) => navigate('/communications?status=failed'),
  },
  {
    id: 'requests.dispatch-settings',
    label: 'Open dispatch settings',
    icon: Settings2,
    permission: 'comms.read',
    keywords: ['chain', 'reminder days', 'master switch'],
    run: ({ navigate }) => navigate('/admin/dispatch-settings'),
  },
]
