import type { LeaseReturnRow, ServiceRequestRow } from '@/mocks/core/tables'
import { addDays } from '@/lib/format'
import { db } from '@/mocks/db'
import {
  applyAction,
  onTransition,
  registerAuthorizer,
  registerEffect,
  registerGuard,
  registerValidator,
  type EffectContext,
} from '@/mocks/workflow'
import { isDue, isPaused, nextStep, templateFor } from './dispatch'
import { ESCALATION_CC, queueMail, settings } from './mail'
import { leaseMailContext, srMailContext } from './templates'

/**
 * H1 rules on the shared transition maps (SPEC §4.1.1, §4.2, §6.3; SPEC_RESOLUTIONS #3, #9,
 * #10, #12, #31) — mirrors `app/modules/h1_requests/{guards,subscribers,actions}.py`:
 * job-only chain guards, first-mail variant authorizers, payload validators, chain / hold /
 * reschedule mails into `mail_log`, and lease unlinking when a request is cancelled.
 */

const SR = 'serviceRequest'
const LR = 'leaseReturn'
const SR_CHAIN = [
  'send_invitation',
  'send_campus_info',
  'send_reminder_1',
  'send_reminder_2',
  'escalate',
]
const LEASE_CHAIN = ['send_info', 'send_reminder_1', 'send_reminder_2', 'escalate']
const JOB = { triggers: ['job'] as const }

// ---- job-only guards (manual sends ignore due rule, pause and master switch) -------------------

for (const action of SR_CHAIN) {
  registerGuard<ServiceRequestRow>(
    SR,
    action,
    ({ row }) => {
      const step = nextStep('service_request', row)
      return step && !isDue(row, step)
        ? { code: 'chain_due', message: 'The next mail of the chain is not due yet.' }
        : null
    },
    JOB,
  )
  registerGuard<ServiceRequestRow>(
    SR,
    action,
    ({ row, today }) =>
      isPaused(row, today) ? { code: 'not_paused', message: 'Communication is paused.' } : null,
    JOB,
  )
}
registerGuard<LeaseReturnRow>(
  LR,
  'send_info',
  ({ row, today }) =>
    row.retirementDate <= addDays(today, settings().leaseInfoDaysBeforeRetirement)
      ? null
      : {
          code: 'retirement_window',
          message: 'The retirement date is outside the info mail window.',
        },
  JOB,
)
for (const action of LEASE_CHAIN) {
  registerGuard<LeaseReturnRow>(
    LR,
    action,
    ({ row }) => {
      const step = nextStep('lease_return', row)
      return step && !isDue(row, step)
        ? { code: 'chain_due', message: 'The next mail of the chain is not due yet.' }
        : null
    },
    JOB,
  )
  registerGuard<LeaseReturnRow>(
    LR,
    action,
    ({ row, today }) =>
      isPaused(row, today) ? { code: 'not_paused', message: 'Communication is paused.' } : null,
    JOB,
  )
}

// ---- the first mail has two variants: hide the one that does not apply ------------------------

registerAuthorizer<ServiceRequestRow>(SR, 'send_campus_info', ({ row }) => row.isCampus)
registerAuthorizer<ServiceRequestRow>(SR, 'send_invitation', ({ row }) => !row.isCampus)

// ---- validators (422) --------------------------------------------------------------------------

for (const resource of [SR, LR] as const) {
  registerValidator(resource, 'pause_communication', ({ payload, today }) =>
    typeof payload.resumeDate === 'string' && payload.resumeDate <= today
      ? { resumeDate: ['The resume date must be in the future.'] }
      : null,
  )
}
registerValidator<LeaseReturnRow>(LR, 'link_service_request', ({ payload }) => {
  const number =
    typeof payload.serviceRequestNumber === 'string'
      ? payload.serviceRequestNumber.trim().toUpperCase()
      : ''
  const sr = db.collection('service_requests').find((s) => s.number === number)
  return sr?.status === 'cancelled'
    ? { serviceRequestNumber: [`Service request ${number} is cancelled.`] }
    : null
})

// ---- mails ---------------------------------------------------------------------------------------

function contactEmail(contactId: number | null): string | null {
  return contactId ? (db.collection('contacts').get(contactId)?.email ?? null) : null
}

function srMail(
  ctx: EffectContext<ServiceRequestRow>,
  templateId: string,
  extra: Parameters<typeof srMailContext>[1] = {},
): boolean {
  const row = db.collection('service_requests').get(ctx.updated.id) ?? ctx.updated
  const email = contactEmail(row.contactId)
  if (!email) return false
  queueMail({
    templateId,
    to: [email],
    cc: templateId === 'sr.escalation' ? [ESCALATION_CC] : [],
    context: srMailContext(row, extra),
    entity: { type: 'service_request', id: row.id, label: row.number },
    trigger: ctx.trigger,
    actorId: ctx.actor?.id ?? null,
  })
  return true
}

onTransition<ServiceRequestRow>(SR, (ctx) => {
  if (SR_CHAIN.includes(ctx.action)) srMail(ctx, templateFor('service_request', ctx.action, false))
  if (ctx.to === 'reschedule_needed' && ctx.from !== 'reschedule_needed') {
    const config = settings()
    const notify = ctx.action !== 'request_reschedule' || ctx.payload.notifyUser !== false
    if (config.srMailsEnabled && config.rescheduleMailEnabled && notify) {
      const code =
        typeof ctx.payload.deviationCodeId === 'number'
          ? db.collection('deviation_codes').get(ctx.payload.deviationCodeId)
          : undefined
      srMail(ctx, ctx.updated.isCampus ? 'sr.reschedule_campus' : 'sr.reschedule', {
        deviationLabel: code?.label ?? null,
        appointmentStart: ctx.row.appointmentStartAt,
      })
    }
  }
  if (ctx.to === 'cancelled' && ctx.from !== 'cancelled') {
    // SPEC_RESOLUTIONS #31: any action reaching `cancelled` unlinks the replacement leases.
    const linked = db
      .collection('lease_returns')
      .filter((l) => l.serviceRequestId === ctx.updated.id && l.status === 'replacement_ordered')
    for (const lease of linked) {
      applyAction(LR, lease.id, 'unlink_service_request', {
        actor: null,
        trigger: 'system',
        payload: { comment: `Service request ${ctx.updated.number} was cancelled.` },
      })
    }
  }
})

/** Runs after the core effect (which sets `hardwareUnavailableNotifiedAt` unconditionally). */
registerEffect<ServiceRequestRow>(SR, 'mark_hardware_unavailable', (ctx) => {
  if (ctx.row.hardwareUnavailableNotifiedAt !== null) return
  const sent = settings().hardwareUnavailableMailEnabled && srMail(ctx, 'sr.hardware_unavailable')
  if (!sent) ctx.update({ hardwareUnavailableNotifiedAt: null })
})

onTransition<LeaseReturnRow>(LR, (ctx) => {
  if (!LEASE_CHAIN.includes(ctx.action)) return
  const row = db.collection('lease_returns').get(ctx.updated.id) ?? ctx.updated
  const email = contactEmail(row.contactId)
  if (!email) return
  queueMail({
    templateId: templateFor('lease_return', ctx.action, row.isCampus),
    to: [email],
    cc: ctx.action === 'escalate' ? [row.escalationEmail ?? '', ESCALATION_CC] : [],
    context: leaseMailContext(row),
    entity: { type: 'lease_return', id: row.id, label: row.assetTag },
    trigger: ctx.trigger,
    actorId: ctx.actor?.id ?? null,
  })
})
