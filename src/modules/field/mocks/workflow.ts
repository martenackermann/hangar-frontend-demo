import type { DeviationOutcome, Trigger } from '@/lib/api/types'
import { notify } from '@/mocks/core/notify'
import type { ServiceRequestRow } from '@/mocks/core/tables'
import { locationOf, moveAsset } from '@/mocks/core/workflow'
import { db } from '@/mocks/db'
import { storeFile } from '@/mocks/files'
import {
  applyAction,
  registerAuthorizer,
  registerEffect,
  registerGuard,
  registerResolver,
  registerValidator,
  type ActionContext,
  type EffectContext,
} from '@/mocks/workflow'
import {
  canExecuteTour,
  countedItems,
  currentAppointment,
  ensureTourRunning,
  externalIdFor,
  isNewSlot,
  pendingStopOf,
  releasePendingStop,
  setStopOutcome,
  supersedeAll,
  tourOfStop,
  tourStartableFailure,
} from './model'
import { protocolPdf } from './protocol'

/**
 * H4 rules on the shared SR transition map (mock twin of app/modules/h4_field): guards
 * `calendar_enabled`, `tour_startable`, `deviation_outcome`, `deployment_scans_complete`,
 * the `own_tour` authorizer (SPEC_RESOLUTIONS #2) and the effects on appointments, tour stops,
 * assets, lease returns and the protocol. Core already registered the SR column effects
 * (appointment setter, resume status, completion/cancel timestamps, asset release).
 */

const SR = 'serviceRequest'
type SrCtx = ActionContext<ServiceRequestRow>
type SrEffect = EffectContext<ServiceRequestRow>

const ON_SITE_OUTCOME: Record<string, DeviationOutcome> = {
  complete_deployment: 'complete',
  reschedule_on_site: 'reschedule',
  cancel_on_site: 'cancel',
}

function deviationOf(payload: Record<string, unknown>) {
  const id = payload.deviationCodeId
  return typeof id === 'number' ? db.collection('deviation_codes').get(id) : undefined
}

function deviationErrors(
  payload: Record<string, unknown>,
  required: boolean,
): Record<string, string[]> | null {
  const id = payload.deviationCodeId
  if (id === undefined || id === null) {
    return required ? { deviationCodeId: ['Choose a deviation code.'] } : null
  }
  const code = deviationOf(payload)
  if (!code?.isActive) return { deviationCodeId: ['Unknown or inactive deviation code.'] }
  const comment =
    typeof payload.deviationComment === 'string' ? payload.deviationComment.trim() : ''
  if (code.requiresComment && !comment)
    return { deviationComment: [`${code.code} requires a comment.`] }
  return null
}

// ---- book_appointment (#13) ----------------------------------------------------------------------

registerValidator<ServiceRequestRow>(SR, 'book_appointment', ({ payload }) => {
  if (typeof payload.calendarId !== 'number') return null // core validator reports it
  return db.collection('booking_calendars').get(payload.calendarId)
    ? null
    : { calendarId: ['Unknown booking calendar.'] }
})
registerGuard<ServiceRequestRow>(SR, 'book_appointment', ({ payload }) => {
  if (typeof payload.calendarId !== 'number') return null
  const calendar = db.collection('booking_calendars').get(payload.calendarId)
  return calendar && !calendar.isEnabled
    ? {
        code: 'calendar_enabled',
        message: 'This booking calendar is disabled and cannot be booked.',
      }
    : null
})
registerEffect<ServiceRequestRow>(SR, 'book_appointment', ({ updated, now }) => {
  const appointments = db.collection('appointments')
  for (const row of appointments.filter((a) => a.serviceRequestId === updated.id && a.isCurrent))
    appointments.update(row.id, { isCurrent: false })
  const sr = db.collection('service_requests').get(updated.id)
  if (!sr?.appointmentStartAt || !sr.appointmentEndAt || !sr.appointmentCalendarId) return
  const contact = db.collection('contacts').get(sr.contactId)
  appointments.insert({
    externalId: externalIdFor(sr.number, sr.appointmentStartAt),
    calendarId: sr.appointmentCalendarId,
    serviceRequestId: sr.id,
    reference: sr.number,
    status: 'booked',
    startAt: sr.appointmentStartAt,
    endAt: sr.appointmentEndAt,
    title: `Hardware rollout visit ${sr.number}`,
    contactName: contact ? `${contact.firstName ?? ''} ${contact.lastName}`.trim() : null,
    contactEmail: contact?.email ?? null,
    street: sr.deliveryStreet,
    town: sr.deliveryCity,
    notes: null,
    bookedAt: now,
    providerUpdatedAt: now,
    source: 'manual',
    lastSyncedAt: now,
    isCurrent: true,
    supersededAt: null,
  })
})

// ---- appointment_synced (#14, sync only) --------------------------------------------------------

registerResolver<ServiceRequestRow>(SR, 'appointment_synced', ({ row }) => ({
  to:
    row.status === 'reschedule_needed'
      ? (row.resumeStatus ?? 'appointment_booked')
      : 'appointment_booked',
}))
registerEffect<ServiceRequestRow>(SR, 'appointment_synced', ({ update }) =>
  update({ resumeStatus: null }),
)

// ---- reschedules (#15, #16, #27) -----------------------------------------------------------------

registerEffect<ServiceRequestRow>(SR, 'request_reschedule', ({ updated, payload, now }) => {
  const current = currentAppointment(updated.id)
  if (current) {
    if (payload.cancelAtProvider === false)
      db.collection('appointments').update(current.id, { isCurrent: false, supersededAt: now })
    else db.collection('appointments').update(current.id, { status: 'cancelled', isCurrent: false })
  }
  supersedeAll(updated.id, now)
  releasePendingStop(updated.id, 'rescheduled', now)
})
registerEffect<ServiceRequestRow>(SR, 'appointment_cancelled', ({ updated, now }) => {
  supersedeAll(updated.id, now)
  releasePendingStop(updated.id, 'rescheduled', now)
})
registerEffect<ServiceRequestRow>(SR, 'reschedule_on_site', ({ updated, now }) => {
  ensureTourRunning(updated.id, now)
  supersedeAll(updated.id, now)
  releasePendingStop(updated.id, 'rescheduled', now)
})

// ---- on-site actions (#26–#28): authorizer + guards ------------------------------------------

for (const [action, outcome] of Object.entries(ON_SITE_OUTCOME)) {
  registerAuthorizer<ServiceRequestRow>(SR, action, ({ row, actor }) => {
    if (actor?.permissions.includes('tours.execute_any')) return true
    const tour = tourOfStop(pendingStopOf(row.id))
    return Boolean(tour) && canExecuteTour(actor, tour)
  })
  registerGuard<ServiceRequestRow>(SR, action, ({ row, today }) =>
    tourStartableFailure(row.id, today),
  )
  registerGuard<ServiceRequestRow>(SR, action, ({ payload }) => {
    const code = deviationOf(payload)
    if (!code || code.outcome === outcome) return null
    return {
      code: 'deviation_outcome',
      message: `Deviation ${code.code} is for outcome '${code.outcome}', not '${outcome}'.`,
    }
  })
}
registerValidator<ServiceRequestRow>(SR, 'reschedule_on_site', ({ payload }) =>
  deviationErrors(payload, true),
)
registerValidator<ServiceRequestRow>(SR, 'cancel_on_site', ({ payload }) =>
  deviationErrors(payload, true),
)
registerValidator<ServiceRequestRow>(SR, 'complete_deployment', ({ payload }) => {
  const errors: Record<string, string[]> = {}
  if (typeof payload.recipientName !== 'string' || !payload.recipientName.trim())
    errors.recipientName = ['Enter the name of the person who received the hardware.']
  if (typeof payload.handoverConfirmed !== 'boolean')
    errors.handoverConfirmed = ['Confirm the handover.']
  return { ...errors, ...deviationErrors(payload, false) }
})

/** `deployment_scans_complete` (SPEC §6.11): scans or a `complete` deviation + handover. */
function scansComplete({ row, payload }: SrCtx) {
  const items = countedItems(row.id)
  const open = items.filter((item) => item.verifiedAt === null)
  if (open.length > 0) {
    const code = deviationOf(payload)
    if (code?.outcome !== 'complete') {
      return {
        code: 'deployment_scans_complete',
        message: `${open.length} of ${items.length} devices are not verified yet. Scan them or choose a deviation.`,
      }
    }
  }
  if (Object.keys(payload).length > 0) {
    const verifiedNew = items.some((item) => isNewSlot(item.slot) && item.verifiedAt !== null)
    if (verifiedNew && payload.handoverConfirmed !== true)
      return {
        code: 'deployment_scans_complete',
        message: 'Confirm that the recipient received the hardware.',
      }
  }
  return null
}
registerGuard<ServiceRequestRow>(SR, 'complete_deployment', scansComplete)

// ---- completion / cancel effects -----------------------------------------------------------------

function deployVerified(ctx: SrEffect): string[] {
  const sr = ctx.updated
  const items = db.collection('service_request_items')
  const collectedTags: string[] = []
  const campus = db.collection('sites').find((s) => s.kind === 'campus')
  for (const item of countedItems(sr.id)) {
    const asset = item.assetId ? db.collection('assets').get(item.assetId) : undefined
    if (!asset) continue
    if (isNewSlot(item.slot)) {
      if (asset.status !== 'provided') continue
      if (item.verifiedAt) {
        moveAsset(asset.id, 'deploy', {
          toStatus: 'in_use',
          toLocationId: locationOf(null, 'in_use'),
          installationPlace: null,
          assignedContactId: sr.contactId,
          actor: ctx.actor,
          trigger: 'system',
        })
      } else {
        moveAsset(asset.id, 'release', {
          toStatus: 'available',
          toLocationId: locationOf(sr.supplyingSiteId, 'goods_in'),
          installationPlace: null,
          serviceRequestId: null,
          actor: ctx.actor,
          trigger: 'system',
        })
        items.update(item.id, { assetId: null })
      }
    } else if (item.verifiedAt) {
      if (asset.status === 'in_use' || asset.status === 'missing') {
        moveAsset(asset.id, 'collect', {
          toStatus: 'collected',
          toLocationId: locationOf(
            sr.isCampus ? (campus?.id ?? sr.supplyingSiteId) : sr.supplyingSiteId,
            'return',
          ),
          serviceRequestId: sr.id,
          actor: ctx.actor,
          trigger: 'system',
        })
      }
      if (asset.assetTag) collectedTags.push(asset.assetTag)
    }
  }
  return collectedTags
}

/** SPEC §6.4 / SPEC_RESOLUTIONS #30: close the lease returns of collected devices. */
function closeCollectedLeases(ctx: SrEffect, tags: readonly string[]): void {
  for (const lease of db
    .collection('lease_returns')
    .filter((l) => tags.includes(l.assetTag) && l.status !== 'closed')) {
    const result = applyAction('leaseReturn', lease.id, 'close', {
      actor: ctx.actor,
      trigger: 'system',
      payload: { comment: `Device collected on site (${ctx.updated.number}).` },
    })
    if (result.ok)
      db.collection('lease_returns').update(lease.id, {
        closedAt: ctx.now,
        closeReason: 'device_collected',
      })
  }
}

/** `sr.protocol` through the mock core `notify()` (the backend queues it the same way). */
export function sendProtocolMail(
  srId: number,
  email: string | null,
  actorId: number | null,
  trigger: Trigger = 'user',
): void {
  const sr = db.collection('service_requests').get(srId)
  if (!sr) return
  const contact = db.collection('contacts').get(sr.contactId)
  notify({
    templateId: 'sr.protocol',
    to: [email ?? contact?.email],
    subject: `Handover protocol for ${sr.number}`,
    context: { sr_number: sr.number },
    entity: { type: 'service_request', id: sr.id, label: sr.number },
    attachments: sr.protocolFileId ? [sr.protocolFileId] : [],
    trigger,
    actorId,
  })
}

function storeProtocol(srId: number, actorId: number | null): void {
  const sr = db.collection('service_requests').get(srId)
  if (!sr) return
  const file = storeFile({
    filename: `protocol-${sr.number}.pdf`,
    contentType: 'application/pdf',
    body: protocolPdf(sr.id),
    purpose: 'protocol',
    entity: { type: 'service_request', id: sr.id },
    actorId,
    ttlHours: null,
  })
  db.collection('service_requests').update(sr.id, { protocolFileId: file.id })
}

registerEffect<ServiceRequestRow>(SR, 'complete_deployment', (ctx) => {
  ensureTourRunning(ctx.updated.id, ctx.now)
  const tags = deployVerified(ctx)
  closeCollectedLeases(ctx, tags)
  const stop = pendingStopOf(ctx.updated.id)
  if (stop) setStopOutcome(stop.id, 'completed', ctx.now)
  storeProtocol(ctx.updated.id, ctx.actor?.id ?? null)
  if (ctx.payload.sendProtocol !== false) {
    const email =
      typeof ctx.payload.protocolEmail === 'string' && ctx.payload.protocolEmail.trim()
        ? ctx.payload.protocolEmail.trim()
        : null
    sendProtocolMail(ctx.updated.id, email, ctx.actor?.id ?? null, ctx.trigger)
  }
})
registerEffect<ServiceRequestRow>(SR, 'complete_manually', ({ updated, now }) => {
  const stop = pendingStopOf(updated.id)
  if (stop) setStopOutcome(stop.id, 'completed', now)
})
registerEffect<ServiceRequestRow>(SR, 'cancel_on_site', ({ updated, now }) => {
  ensureTourRunning(updated.id, now)
  const stop = pendingStopOf(updated.id)
  if (stop) setStopOutcome(stop.id, 'cancelled', now)
})
/** H1's `cancel` (any trigger): drop / cancel the pending stop, cancel the booking (#30). */
registerEffect<ServiceRequestRow>(SR, 'cancel', ({ updated, now }) => {
  releasePendingStop(updated.id, 'cancelled', now)
  const current = currentAppointment(updated.id)
  if (current && Date.parse(current.startAt) > Date.parse(now))
    db.collection('appointments').update(current.id, { status: 'cancelled', isCurrent: false })
})

export { storeProtocol }
