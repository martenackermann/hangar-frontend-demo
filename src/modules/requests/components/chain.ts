import type { DispatchSettings, LeaseReturnDetail, ServiceRequestDetail } from '@/lib/api/types'
import { addDays, businessToday, toBusinessDate } from '@/lib/format'

/**
 * Next step of the communication chain for the drawers' "Communication state" (SPEC §6.3):
 * the action the daily dispatch would run next and the business date it becomes due. Mirrors
 * the backend's `chain.due_date` (anchor = max(base, resume date) + N days).
 */
export interface ChainHint {
  action: string
  label: string
  dueDate: string | null
  /** No automatic step from this status (campus info, escalated, VIP, …). */
  manualOnly: boolean
}

const SR_STEPS: Record<string, { action: string; label: string; days: keyof DispatchSettings }> = {
  imported: { action: 'send_invitation', label: 'Invitation', days: 'srInviteAfterImportDays' },
  invited: { action: 'send_reminder_1', label: 'Reminder 1', days: 'srReminder1AfterDays' },
  reminder_1_sent: { action: 'send_reminder_2', label: 'Reminder 2', days: 'srReminder2AfterDays' },
  reminder_2_sent: { action: 'escalate', label: 'Escalation', days: 'srEscalationAfterDays' },
}

const LEASE_STEPS: Record<string, { action: string; label: string; days: keyof DispatchSettings }> =
  {
    imported: {
      action: 'send_info',
      label: 'Info mail',
      days: 'leaseInfoDaysBeforeRetirement',
    },
    info_sent: { action: 'send_reminder_1', label: 'Reminder 1', days: 'leaseReminder1AfterDays' },
    reminder_1_sent: {
      action: 'send_reminder_2',
      label: 'Reminder 2',
      days: 'leaseReminder2AfterDays',
    },
    reminder_2_sent: { action: 'escalate', label: 'Escalation', days: 'leaseEscalationAfterDays' },
  }

function later(a: string, b: string | null): string {
  return b && b > a ? b : a
}

export function srChainHint(
  sr: ServiceRequestDetail,
  settings: DispatchSettings | undefined,
): ChainHint | null {
  const found = SR_STEPS[sr.status]
  if (!found) return null
  const step =
    sr.status === 'imported' && sr.isCampus
      ? { ...found, action: 'send_campus_info', label: 'Campus info' }
      : found
  if (!settings) return { ...step, dueDate: null, manualOnly: false }
  const imported = toBusinessDate(sr.importedAt)
  const base = sr.status === 'imported' ? imported : (sr.communicationDate ?? imported)
  return {
    action: step.action,
    label: step.label,
    dueDate: addDays(later(base, sr.communicationResumeDate), Number(settings[step.days])),
    manualOnly: !settings.srMailsEnabled,
  }
}

export function leaseChainHint(
  lease: LeaseReturnDetail,
  settings: DispatchSettings | undefined,
): ChainHint | null {
  const step = LEASE_STEPS[lease.status]
  if (!step) return null
  if (!settings) return { action: step.action, label: step.label, dueDate: null, manualOnly: false }
  const days = Number(settings[step.days])
  if (step.action === 'send_info') {
    return {
      ...step,
      dueDate: later(addDays(lease.retirementDate, -days), lease.communicationResumeDate),
      manualOnly: !settings.leaseMailsEnabled,
    }
  }
  const base = lease.communicationDate ?? toBusinessDate(lease.importedAt)
  return {
    ...step,
    dueDate: addDays(later(base, lease.communicationResumeDate), days),
    manualOnly: !settings.leaseMailsEnabled,
  }
}

export function dueText(due: string | null): string {
  if (!due) return '—'
  const today = businessToday()
  return due <= today ? 'due now (next 07:00 run)' : due
}
