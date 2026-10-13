import type { Trigger } from '@/lib/api/types'

/** UI words for codes the API returns without labels (dispatch skip reasons, triggers). */
const SKIP_LABELS: Record<string, string> = {
  contact_email: 'No email address',
  region_resolved: 'Region unresolved',
  not_campus: 'Campus user',
  is_campus: 'Not campus',
  chain_due: 'Not due yet',
  not_paused: 'Paused',
  retirement_window: 'Outside the info window',
  cap_reached: 'Run limit reached',
  transition_not_allowed: 'Status changed',
}

export function skipLabel(code: string): string {
  return SKIP_LABELS[code] ?? code.replace(/_/g, ' ')
}

export function runTriggerLabel(trigger: Trigger): string {
  if (trigger === 'job') return 'Scheduled 07:00'
  if (trigger === 'user') return 'Manual'
  return trigger
}
