import type { ID, ISODateTime, JobStatus, MailStatus, Trigger } from '@/lib/api/types'

/**
 * H1 tables of the demo database (SPEC §5.2), raw camelCase rows exactly as the backend's
 * `export_comms` writes them into `seed.json` (`dispatch_settings`, `dispatch_runs`,
 * `mail_log`). When the fixture lacks them, `mocks/seed.ts` derives them from the core rows.
 */
export interface DispatchSettingsRow {
  id: number
  leaseMailsEnabled: boolean
  leaseInfoDaysBeforeRetirement: number
  leaseReminder1AfterDays: number
  leaseReminder2AfterDays: number
  leaseEscalationAfterDays: number
  srMailsEnabled: boolean
  srInviteAfterImportDays: number
  srReminder1AfterDays: number
  srReminder2AfterDays: number
  srEscalationAfterDays: number
  hardwareUnavailableMailEnabled: boolean
  rescheduleMailEnabled: boolean
  maxMailsPerRun: number
  updatedBy: ID | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface PlannedMail {
  entityType: 'service_request' | 'lease_return'
  entityId: ID
  label: string
  action: string
  templateId: string
  to: string[]
}

export interface DispatchErrorRow {
  entityType: string
  entityId: ID
  label: string
  action: string
  message: string
}

export interface DispatchRunRow {
  id: ID
  backgroundJobId: ID | null
  trigger: Trigger
  dryRun: boolean
  status: JobStatus
  startedAt: ISODateTime
  finishedAt: ISODateTime | null
  counts: Record<string, number>
  skipped: Record<string, number>
  errors: DispatchErrorRow[]
  planned: PlannedMail[] | null
  triggeredBy: ID | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface MailLogRow {
  id: ID
  notificationId: string
  templateId: string
  status: MailStatus
  toAddresses: string[]
  ccAddresses: string[]
  subject: string | null
  bodyHtml: string | null
  bodyText: string | null
  entityType: string | null
  entityId: ID | null
  entityLabel: string | null
  attachmentFileIds: ID[]
  messageId: string | null
  error: string | null
  trigger: Trigger
  triggeredBy: ID | null
  queuedAt: ISODateTime
  sentAt: ISODateTime | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

declare module '@/mocks/db' {
  interface DemoCollections {
    dispatch_settings: DispatchSettingsRow
    dispatch_runs: DispatchRunRow
    mail_log: MailLogRow
  }
}

/** SPEC §5.2 defaults and ranges (`PUT /dispatch-settings` validation). */
export const SETTING_RANGES = {
  leaseInfoDaysBeforeRetirement: [42, 1, 365],
  leaseReminder1AfterDays: [7, 1, 60],
  leaseReminder2AfterDays: [7, 1, 60],
  leaseEscalationAfterDays: [7, 1, 60],
  srInviteAfterImportDays: [1, 0, 30],
  srReminder1AfterDays: [5, 1, 60],
  srReminder2AfterDays: [5, 1, 60],
  srEscalationAfterDays: [5, 1, 60],
  maxMailsPerRun: [500, 1, 5000],
} as const satisfies Record<string, readonly [number, number, number]>

export type RangedSetting = keyof typeof SETTING_RANGES

export function defaultSettings(now: string): DispatchSettingsRow {
  return {
    id: 1,
    leaseMailsEnabled: true,
    srMailsEnabled: true,
    hardwareUnavailableMailEnabled: true,
    rescheduleMailEnabled: true,
    leaseInfoDaysBeforeRetirement: 42,
    leaseReminder1AfterDays: 7,
    leaseReminder2AfterDays: 7,
    leaseEscalationAfterDays: 7,
    srInviteAfterImportDays: 1,
    srReminder1AfterDays: 5,
    srReminder2AfterDays: 5,
    srEscalationAfterDays: 5,
    maxMailsPerRun: 500,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
  }
}
