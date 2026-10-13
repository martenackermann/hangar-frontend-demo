import type { BackgroundJob } from '@/lib/api/types'
import { addDays, businessToday, toBusinessDate } from '@/lib/format'
import type { MockActor } from '@/mocks/auth'
import type { LeaseReturnRow, ServiceRequestRow } from '@/mocks/core/tables'
import { db } from '@/mocks/db'
import { problemInfo } from '@/mocks/http'
import { applyAction, type GuardFailure, type Resource } from '@/mocks/workflow'
import { settings } from './mail'
import type { DispatchErrorRow, DispatchRunRow, DispatchSettingsRow, PlannedMail } from './tables'

/**
 * Communication chain rules (SPEC §6.3) and the dispatch run — the MSW twin of the backend's
 * `chain.py` + `dispatch.py`: candidates = status ∧ due ∧ not paused ∧ master switch (#10),
 * steps in reverse order (leases first), guard failures → `skipped[code]`, budget →
 * `cap_reached`, dry runs evaluate without writing and return `planned`.
 */

type EntityType = 'service_request' | 'lease_return'
type ChainRow = ServiceRequestRow | LeaseReturnRow

export interface ChainStep {
  entityType: EntityType
  action: string
  fromStatus: string
  daysKey: keyof DispatchSettingsRow
  template: string
}

export const SR_STEPS: readonly ChainStep[] = [
  {
    entityType: 'service_request',
    action: 'send_invitation',
    fromStatus: 'imported',
    daysKey: 'srInviteAfterImportDays',
    template: 'sr.invitation',
  },
  {
    entityType: 'service_request',
    action: 'send_reminder_1',
    fromStatus: 'invited',
    daysKey: 'srReminder1AfterDays',
    template: 'sr.reminder_1',
  },
  {
    entityType: 'service_request',
    action: 'send_reminder_2',
    fromStatus: 'reminder_1_sent',
    daysKey: 'srReminder2AfterDays',
    template: 'sr.reminder_2',
  },
  {
    entityType: 'service_request',
    action: 'escalate',
    fromStatus: 'reminder_2_sent',
    daysKey: 'srEscalationAfterDays',
    template: 'sr.escalation',
  },
]
export const LEASE_STEPS: readonly ChainStep[] = [
  {
    entityType: 'lease_return',
    action: 'send_info',
    fromStatus: 'imported',
    daysKey: 'leaseInfoDaysBeforeRetirement',
    template: 'lease.info',
  },
  {
    entityType: 'lease_return',
    action: 'send_reminder_1',
    fromStatus: 'info_sent',
    daysKey: 'leaseReminder1AfterDays',
    template: 'lease.reminder_1',
  },
  {
    entityType: 'lease_return',
    action: 'send_reminder_2',
    fromStatus: 'reminder_1_sent',
    daysKey: 'leaseReminder2AfterDays',
    template: 'lease.reminder_2',
  },
  {
    entityType: 'lease_return',
    action: 'escalate',
    fromStatus: 'reminder_2_sent',
    daysKey: 'leaseEscalationAfterDays',
    template: 'lease.escalation',
  },
]
const DISPATCH_ORDER: readonly ChainStep[] = [
  ...[...LEASE_STEPS].reverse(),
  ...[...SR_STEPS].reverse(),
]

export const SR_TEMPLATE_BY_ACTION: Record<string, string> = {
  send_invitation: 'sr.invitation',
  send_campus_info: 'sr.campus_info',
  send_reminder_1: 'sr.reminder_1',
  send_reminder_2: 'sr.reminder_2',
  escalate: 'sr.escalation',
}
export const LEASE_TEMPLATE_BY_ACTION: Record<string, string> = {
  send_info: 'lease.info',
  send_reminder_1: 'lease.reminder_1',
  send_reminder_2: 'lease.reminder_2',
  escalate: 'lease.escalation',
}

export function templateFor(entityType: EntityType, action: string, isCampus: boolean): string {
  if (entityType === 'service_request') return SR_TEMPLATE_BY_ACTION[action] ?? action
  const base = LEASE_TEMPLATE_BY_ACTION[action] ?? action
  return isCampus ? `${base}_campus` : base
}

export function isPaused(row: ChainRow, today = businessToday()): boolean {
  return (
    row.communicationPaused ||
    (row.communicationResumeDate !== null && row.communicationResumeDate > today)
  )
}

export function nextStep(entityType: EntityType, row: ChainRow): ChainStep | undefined {
  return (entityType === 'service_request' ? SR_STEPS : LEASE_STEPS).find(
    (step) => step.fromStatus === row.status,
  )
}

/** First business date the step is due (anchor = max(base, resume) + N days). */
export function dueDate(
  row: ChainRow,
  step: ChainStep,
  config: DispatchSettingsRow = settings(),
): string | null {
  const days = Number(config[step.daysKey])
  const resume = row.communicationResumeDate
  if (step.entityType === 'lease_return' && step.action === 'send_info') {
    const opens = addDays((row as LeaseReturnRow).retirementDate, -days)
    return resume && resume > opens ? resume : opens
  }
  const imported = toBusinessDate(row.importedAt)
  const base = step.action === 'send_invitation' ? imported : (row.communicationDate ?? imported)
  const anchor = resume && resume > base ? resume : base
  return addDays(anchor, days)
}

export function isDue(row: ChainRow, step: ChainStep, today = businessToday()): boolean {
  const due = dueDate(row, step)
  return due !== null && due <= today
}

/** Guard codes the job trigger would hit (core guards that read core rows). */
export function jobGuardFailure(
  entityType: EntityType,
  row: ChainRow,
  action: string,
): GuardFailure | null {
  const contact = row.contactId ? db.collection('contacts').get(row.contactId) : undefined
  if (!contact?.email)
    return { code: 'contact_email', message: 'The employee has no email address.' }
  if (entityType === 'service_request' && action !== 'send_campus_info') {
    const sr = row as ServiceRequestRow
    const region = sr.regionId ? db.collection('regions').get(sr.regionId) : undefined
    if (!region?.bookingDestinationId || !region.bookingServiceId)
      return { code: 'region_resolved', message: 'The region is not resolved.' }
  }
  return null
}

export interface Outcome {
  counts: Record<string, number>
  skipped: Record<string, number>
  errors: DispatchErrorRow[]
  planned: PlannedMail[] | null
}

function bump(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1
}

/** One dispatch pass over all chain steps (SPEC §6.3 algorithm). */
export function executeDispatch(dryRun: boolean): Outcome {
  const config = settings()
  const today = businessToday()
  let budget = config.maxMailsPerRun
  const outcome: Outcome = { counts: {}, skipped: {}, errors: [], planned: dryRun ? [] : null }
  for (const step of DISPATCH_ORDER) {
    const isSr = step.entityType === 'service_request'
    if (!(isSr ? config.srMailsEnabled : config.leaseMailsEnabled)) continue
    const rows: ChainRow[] = isSr
      ? db.collection('service_requests').filter((r) => r.status === step.fromStatus)
      : db.collection('lease_returns').filter((r) => r.status === step.fromStatus)
    const candidates = rows
      .filter((row) => !isPaused(row, today) && isDue(row, step, today))
      .sort((a, b) => a.id - b.id)
    for (const row of candidates) {
      if (budget <= 0) {
        bump(outcome.skipped, 'cap_reached')
        continue
      }
      const action =
        isSr && step.action === 'send_invitation'
          ? (row as ServiceRequestRow).isCampus
            ? 'send_campus_info'
            : 'send_invitation'
          : step.action
      const label = isSr ? (row as ServiceRequestRow).number : (row as LeaseReturnRow).assetTag
      const template = templateFor(step.entityType, action, row.isCampus)
      const failure = jobGuardFailure(step.entityType, row, action)
      if (failure) {
        bump(outcome.skipped, failure.code)
        continue
      }
      if (dryRun) {
        const contact = row.contactId ? db.collection('contacts').get(row.contactId) : undefined
        outcome.planned?.push({
          entityType: step.entityType,
          entityId: row.id,
          label,
          action,
          templateId: template,
          to: contact?.email ? [contact.email] : [],
        })
        bump(outcome.counts, template)
        budget -= 1
        continue
      }
      const resource: Resource = isSr ? 'serviceRequest' : 'leaseReturn'
      const result = applyAction(resource, row.id, action, { actor: null, trigger: 'job' })
      if (result.ok) {
        bump(outcome.counts, template)
        budget -= 1
      } else {
        const info = problemInfo(result.response)
        if (info.code === 'guard_failed') bump(outcome.skipped, 'chain_due')
        else
          outcome.errors.push({
            entityType: step.entityType,
            entityId: row.id,
            label,
            action,
            message: info.detail ?? info.title,
          })
      }
    }
  }
  return outcome
}

export function dispatchResult(runId: number, outcome: Outcome): BackgroundJob['result'] {
  return {
    kind: 'comms_dispatch',
    dispatchRunId: runId,
    counts: outcome.counts,
    skipped: outcome.skipped,
    errorCount: outcome.errors.length,
  }
}

export function storeOutcome(runId: number, outcome: Outcome, status: DispatchRunRow['status']) {
  const now = new Date().toISOString()
  return db.collection('dispatch_runs').update(runId, {
    counts: outcome.counts,
    skipped: outcome.skipped,
    errors: outcome.errors,
    planned: outcome.planned,
    status,
    finishedAt: now,
    updatedAt: now,
  })
}

/** Queued/running real run younger than 30 minutes (blocks "Run now" with 409). */
export function runInProgress(): DispatchRunRow | undefined {
  const limit = Date.now() - 30 * 60_000
  return db
    .collection('dispatch_runs')
    .find(
      (run) =>
        !run.dryRun &&
        ['queued', 'running'].includes(run.status) &&
        Date.parse(run.startedAt) > limit,
    )
}

export function newRun(input: {
  dryRun: boolean
  actor: MockActor | null
  status: DispatchRunRow['status']
}): DispatchRunRow {
  const now = new Date().toISOString()
  return db.collection('dispatch_runs').insert({
    backgroundJobId: null,
    trigger: input.actor ? 'user' : 'job',
    dryRun: input.dryRun,
    status: input.status,
    startedAt: now,
    finishedAt: null,
    counts: {},
    skipped: {},
    errors: [],
    planned: null,
    triggeredBy: input.actor?.id ?? null,
    createdAt: now,
    updatedAt: now,
  })
}
