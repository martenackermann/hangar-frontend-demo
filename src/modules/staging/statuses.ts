import type { ServiceRequestStatus } from '@/lib/api/types'

/** Statuses before an appointment is booked: the Staging drawer tab stays hidden. */
export const BEFORE_BOOKING: readonly ServiceRequestStatus[] = [
  'imported',
  'imported_vip',
  'hardware_unavailable',
  'invited',
  'campus_info_sent',
  'reminder_1_sent',
  'reminder_2_sent',
  'escalated',
]
