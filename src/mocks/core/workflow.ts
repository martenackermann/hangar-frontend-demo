import type {
  AssetAction,
  AssetStatus,
  LeaseReturnStatus,
  LocationType,
  ServiceRequestStatus,
  Trigger,
} from '@/lib/api/types'
import { addDays, businessToday } from '@/lib/format'
import type { MockActor } from '@/mocks/auth'
import { db } from '@/mocks/db'
import {
  registerCondition,
  registerEffect,
  registerGuard,
  registerResolver,
  registerValidator,
  type ActionContext,
  type EffectContext,
  type GuardFailure,
} from '@/mocks/workflow'
import { effectiveDeliveryType, itemsOf } from './read-models'
import type { AssetRow, LeaseReturnRow, ServiceRequestRow } from './tables'

/**
 * Core guards, resolvers and effects of the transition maps (SPEC §4.1.1, §4.2, §4.3;
 * SPEC_RESOLUTIONS #3: core implements the guards that read core tables only, #9 chain mails set
 * `communication_date`, #50 cancel clears new items only). Slice-owned rules (chain timing,
 * calendars, deployment scans, mails, provider calls) are registered by the slices in
 * `src/modules/<m>/mocks/workflow.ts`.
 */

// ---- asset service (the only way to move assets) -------------------------------------------

export function locationOf(siteId: number | null, type: LocationType): number {
  const location = db
    .collection('stock_locations')
    .find(
      (l) =>
        l.type === type &&
        (['in_transit', 'in_use', 'off_fleet'].includes(type)
          ? l.siteId === null
          : l.siteId === siteId),
    )
  if (!location) throw new Error(`No ${type} location for site ${siteId ?? 'global'}`)
  return location.id
}

export interface MoveOptions {
  toStatus: AssetStatus
  toLocationId?: number
  /** `undefined` keeps the place; `null` clears it. */
  installationPlace?: string | null
  /** `undefined` keeps the link; `null` clears it. */
  serviceRequestId?: number | null
  assignedContactId?: number | null
  actor: MockActor | null
  trigger: Trigger
  reason?: string | null
  sourceRef?: string | null
}

/** AssetService.move (SPEC §2.4): updates the asset and appends an `asset_movements` row. */
export function moveAsset(
  assetId: number,
  action: AssetAction,
  options: MoveOptions,
): AssetRow | undefined {
  const assets = db.collection('assets')
  const asset = assets.get(assetId)
  if (!asset) return undefined
  const now = new Date().toISOString()
  const toLocationId = options.toLocationId ?? asset.locationId
  const toPlace =
    options.installationPlace === undefined ? asset.installationPlace : options.installationPlace
  db.collection('asset_movements').insert({
    assetId,
    action,
    fromStatus: asset.status,
    toStatus: options.toStatus,
    fromLocationId: asset.locationId,
    toLocationId,
    fromInstallationPlace: asset.installationPlace,
    toInstallationPlace: toPlace,
    serviceRequestId:
      options.serviceRequestId === undefined ? asset.serviceRequestId : options.serviceRequestId,
    actorUserId: options.actor?.id ?? null,
    trigger: options.trigger,
    reason: options.reason ?? null,
    sourceRef: options.sourceRef ?? null,
    occurredAt: now,
  })
  return assets.update(assetId, {
    status: options.toStatus,
    locationId: toLocationId,
    installationPlace: toPlace,
    ...(options.serviceRequestId !== undefined
      ? { serviceRequestId: options.serviceRequestId }
      : {}),
    ...(options.assignedContactId !== undefined
      ? { assignedContactId: options.assignedContactId }
      : {}),
    statusChangedAt: asset.status === options.toStatus ? asset.statusChangedAt : now,
    version: asset.version + 1,
  })
}

function newItems(srId: number) {
  return itemsOf(srId).filter((item) => item.slot.startsWith('new_'))
}

function newAssets(srId: number): AssetRow[] {
  return newItems(srId)
    .map((item) => (item.assetId ? db.collection('assets').get(item.assetId) : undefined))
    .filter((asset): asset is AssetRow => asset !== undefined)
}

/** Appointment setter — the only writer of `service_requests.appointment_*` (SPEC §2.4). */
export function setAppointment(
  srId: number,
  appointment: {
    startAt: string | null
    endAt: string | null
    calendarId: number | null
    calendarName: string | null
  },
): void {
  db.collection('service_requests').update(srId, {
    appointmentStartAt: appointment.startAt,
    appointmentEndAt: appointment.endAt,
    appointmentCalendarId: appointment.calendarId,
    appointmentCalendarName: appointment.calendarName,
  })
}

// ---- guards ---------------------------------------------------------------------------------

type SrCtx = ActionContext<ServiceRequestRow>

const fail = (code: string, message: string): GuardFailure => ({ code, message })

function contactEmail({ row }: SrCtx) {
  const contact = db.collection('contacts').get(row.contactId)
  return contact?.email ? null : fail('contact_email', 'The employee has no email address.')
}

function regionResolved({ row }: SrCtx) {
  const region = row.regionId ? db.collection('regions').get(row.regionId) : undefined
  return region?.bookingDestinationId && region.bookingServiceId
    ? null
    : fail('region_resolved', 'The region is not resolved, so there is no booking link.')
}

function allNewItemsAssigned({ row }: SrCtx) {
  return newItems(row.id).every((item) => item.assetId !== null)
    ? null
    : fail('all_new_items_assigned', 'Assign a device to every new item first.')
}

function isEditor({ row, actor }: SrCtx) {
  return row.editorUserId !== null && row.editorUserId === actor?.id
    ? null
    : fail('is_editor', 'Only the editor who claimed the request can do this.')
}

const SR = 'serviceRequest'

for (const action of ['send_invitation']) {
  registerGuard<ServiceRequestRow>(SR, action, ({ row }) =>
    row.isCampus ? fail('not_campus', 'Campus employees get the campus info instead.') : null,
  )
}
registerGuard<ServiceRequestRow>(SR, 'send_campus_info', ({ row }) =>
  row.isCampus ? null : fail('is_campus', 'Only for Campus employees.'),
)
for (const action of [
  'send_invitation',
  'send_campus_info',
  'send_reminder_1',
  'send_reminder_2',
  'escalate',
]) {
  registerGuard<ServiceRequestRow>(SR, action, contactEmail)
}
for (const action of ['send_invitation', 'send_reminder_1', 'send_reminder_2', 'escalate']) {
  registerGuard<ServiceRequestRow>(SR, action, regionResolved)
}
// Backend `Transition.condition`: taking over is only possible from someone else (re-claiming
// your own request is 409 transition_not_allowed, not a guard).
registerCondition<ServiceRequestRow>(
  SR,
  'claim',
  ({ row, actor }) =>
    row.status === 'appointment_booked' || (actor !== null && row.editorUserId !== actor.id),
)
registerGuard<ServiceRequestRow>(SR, 'claim', ({ row }) =>
  row.appointmentStartAt ? null : fail('has_appointment', 'The request has no appointment.'),
)
registerGuard<ServiceRequestRow>(SR, 'release', ({ row, actor }) =>
  row.editorUserId === actor?.id || actor?.role === 'admin'
    ? null
    : fail('is_editor_or_admin', 'Only the editor or an admin can release the request.'),
)
registerGuard<ServiceRequestRow>(SR, 'finish_personalization', isEditor)
registerGuard<ServiceRequestRow>(SR, 'finish_personalization', allNewItemsAssigned)
// Backend condition: from `appointment_booked` only without new items (else 409
// transition_not_allowed); in progress the editor guard and the assignment guard apply.
registerCondition<ServiceRequestRow>(
  SR,
  'skip_preparation',
  ({ row }) => row.status !== 'appointment_booked' || newItems(row.id).length === 0,
)
registerGuard<ServiceRequestRow>(SR, 'skip_preparation', (ctx) =>
  ctx.row.status === 'appointment_booked' ? null : (isEditor(ctx) ?? allNewItemsAssigned(ctx)),
)
registerGuard<ServiceRequestRow>(SR, 'close_order', allNewItemsAssigned)
registerGuard<ServiceRequestRow>(SR, 'close_order', ({ row }) => {
  const required = [
    ...new Set([...row.requestedSoftware, ...row.addedSoftware].map((s) => s.trim().toLowerCase())),
  ]
  const installed = new Set(row.installedSoftware.map((s) => s.trim().toLowerCase()))
  return required.every((s) => installed.has(s))
    ? null
    : fail('software_checklist_complete', 'Tick every software item first.')
})
registerGuard<ServiceRequestRow>(SR, 'mark_provided', ({ row }) =>
  effectiveDeliveryType(row) === 'technician'
    ? null
    : fail('delivery_type_is_technician', 'Parcel requests are shipped, not handed over.'),
)
for (const action of ['ship', 'close_without_label']) {
  registerGuard<ServiceRequestRow>(SR, action, ({ row }) =>
    effectiveDeliveryType(row)?.startsWith('parcel')
      ? null
      : fail('delivery_type_is_parcel', 'Only for parcel delivery.'),
  )
}
registerGuard<ServiceRequestRow>(SR, 'ship', ({ row }) =>
  newItems(row.id).every((item) => item.packedAt !== null)
    ? null
    : fail('all_new_items_packed', 'Pack every new device first.'),
)
registerValidator<ServiceRequestRow>(SR, 'book_appointment', ({ payload }) => {
  const errors: Record<string, string[]> = {}
  if (typeof payload.calendarId !== 'number') errors.calendarId = ['Choose a calendar.']
  if (typeof payload.startAt !== 'string') errors.startAt = ['Choose a date and time.']
  return errors
})
registerGuard<ServiceRequestRow>(SR, 'book_appointment', ({ payload }) =>
  typeof payload.startAt === 'string' && Date.parse(payload.startAt) <= Date.now()
    ? fail('start_in_future', 'The appointment must be in the future.')
    : null,
)
for (const action of ['pause_communication', 'request_reschedule']) {
  registerValidator<ServiceRequestRow>(SR, action, ({ payload }) =>
    typeof payload.reason === 'string' && payload.reason.trim()
      ? null
      : { reason: ['A reason is required.'] },
  )
}

// ---- resolvers ------------------------------------------------------------------------------

registerResolver<ServiceRequestRow>(SR, 'book_appointment', ({ row }) => ({
  to:
    row.status === 'reschedule_needed'
      ? (row.resumeStatus ?? 'appointment_booked')
      : 'appointment_booked',
}))
registerResolver<ServiceRequestRow>(SR, 'reopen', ({ row }) => ({
  to: row.isVip ? 'imported_vip' : 'imported',
}))
registerResolver<ServiceRequestRow>(SR, 'pause_communication', () => ({ to: null }))
registerResolver<ServiceRequestRow>(SR, 'resume_communication', () => ({ to: null }))
registerGuard<ServiceRequestRow>(SR, 'resume_communication', ({ row, today }) =>
  row.communicationPaused ||
  (row.communicationResumeDate !== null && row.communicationResumeDate > today)
    ? null
    : fail('not_paused', 'Communication is not paused.'),
)
const SR_CHAIN: Partial<Record<ServiceRequestStatus, string>> = {
  invited: 'send_reminder_1',
  reminder_1_sent: 'send_reminder_2',
  reminder_2_sent: 'escalate',
}
const SR_CHAIN_TARGET: Record<string, ServiceRequestStatus> = {
  send_invitation: 'invited',
  send_campus_info: 'campus_info_sent',
  send_reminder_1: 'reminder_1_sent',
  send_reminder_2: 'reminder_2_sent',
  escalate: 'escalated',
}
registerResolver<ServiceRequestRow>(SR, 'send_next_mail', (ctx) => {
  const action =
    ctx.row.status === 'imported'
      ? ctx.row.isCampus
        ? 'send_campus_info'
        : 'send_invitation'
      : SR_CHAIN[ctx.row.status]
  if (!action) return fail('transition_not_allowed', 'No mail is due in this status.')
  const blocked = contactEmail(ctx) ?? (action === 'send_campus_info' ? null : regionResolved(ctx))
  if (blocked) return blocked
  return { to: SR_CHAIN_TARGET[action] ?? ctx.row.status, action }
})

// ---- effects --------------------------------------------------------------------------------

type SrEffect = EffectContext<ServiceRequestRow>

for (const action of [
  'send_invitation',
  'send_campus_info',
  'send_reminder_1',
  'send_reminder_2',
  'escalate',
]) {
  registerEffect<ServiceRequestRow>(SR, action, ({ update, today }) =>
    update({ communicationDate: today }),
  )
}
// `hardwareUnavailableNotifiedAt` is written by the mail subscriber (H1) once the mail is sent,
// as in the backend; core only records where the hold came from (#37).
registerEffect<ServiceRequestRow>(SR, 'mark_hardware_unavailable', ({ update, trigger }) =>
  update({ holdSource: trigger === 'import' ? 'import' : 'manual' }),
)
registerEffect<ServiceRequestRow>(SR, 'release_hardware_hold', ({ update, today }) =>
  update({ communicationDate: null, communicationResumeDate: today, holdSource: null }),
)
registerEffect<ServiceRequestRow>(SR, 'pause_communication', ({ update, payload }) => {
  const resumeDate = typeof payload.resumeDate === 'string' ? payload.resumeDate : null
  update({
    communicationPaused: resumeDate === null,
    communicationResumeDate: resumeDate,
    communicationPauseReason: typeof payload.reason === 'string' ? payload.reason : null,
  })
})
registerEffect<ServiceRequestRow>(SR, 'resume_communication', ({ update, today }) =>
  update({
    communicationPaused: false,
    communicationResumeDate: today,
    communicationPauseReason: null,
  }),
)
registerEffect<ServiceRequestRow>(SR, 'book_appointment', ({ update, updated, payload }) => {
  const calendarId = typeof payload.calendarId === 'number' ? payload.calendarId : null
  const calendar = calendarId ? db.collection('booking_calendars').get(calendarId) : undefined
  const startAt = String(payload.startAt)
  const endAt =
    typeof payload.endAt === 'string'
      ? payload.endAt
      : new Date(Date.parse(startAt) + 3_600_000).toISOString()
  setAppointment(updated.id, { startAt, endAt, calendarId, calendarName: calendar?.name ?? null })
  update({ resumeStatus: null })
})
registerEffect<ServiceRequestRow>(SR, 'claim', ({ update, actor, now }) =>
  update({ editorUserId: actor?.id ?? null, claimedAt: now }),
)
registerEffect<ServiceRequestRow>(SR, 'release', ({ update }) => update({ editorUserId: null }))
registerEffect<ServiceRequestRow>(SR, 'finish_personalization', ({ update, now }) =>
  update({ editorUserId: null, personalizedAt: now }),
)
registerEffect<ServiceRequestRow>(SR, 'reopen_personalization', ({ update, actor }) =>
  update({ editorUserId: actor?.id ?? null }),
)

function prepareAssets(ctx: SrEffect): void {
  const goodsOut = locationOf(ctx.updated.supplyingSiteId, 'goods_out')
  for (const asset of newAssets(ctx.updated.id)) {
    if (asset.status === 'assigned') {
      moveAsset(asset.id, 'prepare', {
        toStatus: 'prepared',
        toLocationId: goodsOut,
        installationPlace: null,
        actor: ctx.actor,
        trigger: ctx.trigger,
      })
    }
  }
}

function provideAssets(ctx: SrEffect): void {
  const inTransit = locationOf(null, 'in_transit')
  for (const asset of newAssets(ctx.updated.id)) {
    if (asset.status === 'prepared') {
      moveAsset(asset.id, 'provide', {
        toStatus: 'provided',
        toLocationId: inTransit,
        actor: ctx.actor,
        trigger: ctx.trigger,
      })
    }
  }
}

function releaseAssets(ctx: SrEffect, clearItems: boolean): void {
  for (const item of newItems(ctx.updated.id)) {
    const asset = item.assetId ? db.collection('assets').get(item.assetId) : undefined
    if (asset && ['assigned', 'prepared', 'provided'].includes(asset.status)) {
      moveAsset(asset.id, 'release', {
        toStatus: 'available',
        toLocationId:
          asset.status === 'assigned'
            ? asset.locationId
            : locationOf(ctx.updated.supplyingSiteId, 'goods_in'),
        installationPlace: asset.status === 'assigned' ? asset.installationPlace : null,
        serviceRequestId: null,
        actor: ctx.actor,
        trigger: ctx.trigger,
      })
    }
    if (clearItems)
      db.collection('service_request_items').update(item.id, {
        assetId: null,
        assignedAt: null,
        assignedBy: null,
      })
  }
}

registerEffect<ServiceRequestRow>(SR, 'skip_preparation', (ctx) => {
  prepareAssets(ctx)
  ctx.update({ withoutAssetPrep: true, editorUserId: null, orderClosedAt: ctx.now })
})
registerEffect<ServiceRequestRow>(SR, 'close_order', (ctx) => {
  prepareAssets(ctx)
  ctx.update({ orderClosedAt: ctx.now })
})
registerEffect<ServiceRequestRow>(SR, 'mark_provided', (ctx) => {
  provideAssets(ctx)
  ctx.update({ providedAt: ctx.now })
})
registerEffect<ServiceRequestRow>(SR, 'close_without_label', (ctx) => {
  provideAssets(ctx)
  ctx.update({ providedAt: ctx.now })
})
registerEffect<ServiceRequestRow>(SR, 'ship', (ctx) => {
  provideAssets(ctx)
  ctx.update({ shippedAt: ctx.now })
})

/** Reschedule: remember where to continue; `provided` goes back to the hub (SPEC #15/#16). */
function rescheduleEffect(ctx: SrEffect): void {
  const from = ctx.from as ServiceRequestStatus
  let resume: ServiceRequestStatus = from
  if (from === 'provided') {
    resume = 'ready_for_picking'
    const goodsOut = locationOf(ctx.updated.supplyingSiteId, 'goods_out')
    for (const asset of newAssets(ctx.updated.id)) {
      if (asset.status === 'provided') {
        moveAsset(asset.id, 'return_to_hub', {
          toStatus: 'prepared',
          toLocationId: goodsOut,
          actor: ctx.actor,
          trigger: ctx.trigger,
        })
      }
    }
  }
  setAppointment(ctx.updated.id, {
    startAt: null,
    endAt: null,
    calendarId: null,
    calendarName: null,
  })
  ctx.update({ resumeStatus: resume })
}
registerEffect<ServiceRequestRow>(SR, 'request_reschedule', rescheduleEffect)
registerEffect<ServiceRequestRow>(SR, 'appointment_cancelled', rescheduleEffect)
registerEffect<ServiceRequestRow>(SR, 'reschedule_on_site', (ctx) => {
  rescheduleEffect(ctx)
  ctx.update({
    deviationCodeId:
      typeof ctx.payload.deviationCodeId === 'number' ? ctx.payload.deviationCodeId : null,
    deviationComment:
      typeof ctx.payload.deviationComment === 'string' ? ctx.payload.deviationComment : null,
  })
})
registerEffect<ServiceRequestRow>(SR, 'complete_manually', (ctx) => {
  const inUse = locationOf(null, 'in_use')
  for (const asset of newAssets(ctx.updated.id)) {
    if (asset.status === 'provided') {
      moveAsset(asset.id, 'deploy', {
        toStatus: 'in_use',
        toLocationId: inUse,
        assignedContactId: ctx.updated.contactId,
        actor: ctx.actor,
        trigger: ctx.trigger,
      })
    }
  }
  ctx.update({ completedAt: ctx.now })
})
registerEffect<ServiceRequestRow>(SR, 'complete_deployment', ({ update, now, payload }) =>
  update({
    completedAt: now,
    deviationCodeId: typeof payload.deviationCodeId === 'number' ? payload.deviationCodeId : null,
    deviationComment:
      typeof payload.deviationComment === 'string' ? payload.deviationComment : null,
  }),
)
registerEffect<ServiceRequestRow>(SR, 'cancel_on_site', (ctx) => {
  releaseAssets(ctx, true)
  ctx.update({
    cancelledAt: ctx.now,
    deviationCodeId:
      typeof ctx.payload.deviationCodeId === 'number' ? ctx.payload.deviationCodeId : null,
    deviationComment:
      typeof ctx.payload.deviationComment === 'string' ? ctx.payload.deviationComment : null,
  })
})
registerEffect<ServiceRequestRow>(SR, 'cancel', (ctx) => {
  releaseAssets(ctx, true)
  ctx.update({ cancelledAt: ctx.now, editorUserId: null })
})
registerEffect<ServiceRequestRow>(SR, 'reopen', ({ update, today }) =>
  update({ cancelledAt: null, communicationDate: null, communicationResumeDate: today }),
)

// ---- lease returns -----------------------------------------------------------------------------

const LR = 'leaseReturn'
type LrCtx = ActionContext<LeaseReturnRow>

/** Restored status (SPEC §4.2) for unlink / reopen. */
export function restoredLeaseStatus(lr: LeaseReturnRow): LeaseReturnStatus {
  if (lr.serviceRequestId) return 'replacement_ordered'
  if (lr.escalationSentAt) return 'escalated'
  if (lr.reminder2SentAt) return 'reminder_2_sent'
  if (lr.reminder1SentAt) return 'reminder_1_sent'
  if (lr.infoSentAt) return 'info_sent'
  return lr.isVip ? 'imported_vip' : 'imported'
}

function leaseContactEmail({ row }: LrCtx) {
  const contact = row.contactId ? db.collection('contacts').get(row.contactId) : undefined
  return contact?.email ? null : fail('contact_email', 'The employee has no email address.')
}

const LEASE_MAIL_FIELD = {
  send_info: 'infoSentAt',
  send_reminder_1: 'reminder1SentAt',
  send_reminder_2: 'reminder2SentAt',
  escalate: 'escalationSentAt',
} as const
for (const [action, field] of Object.entries(LEASE_MAIL_FIELD)) {
  registerGuard<LeaseReturnRow>(LR, action, leaseContactEmail)
  registerEffect<LeaseReturnRow>(LR, action, ({ update, today, now }) =>
    update({ communicationDate: today, [field]: now }),
  )
}
const LEASE_CHAIN: Partial<Record<LeaseReturnStatus, keyof typeof LEASE_MAIL_FIELD>> = {
  imported: 'send_info',
  info_sent: 'send_reminder_1',
  reminder_1_sent: 'send_reminder_2',
  reminder_2_sent: 'escalate',
}
const LEASE_TARGET: Record<keyof typeof LEASE_MAIL_FIELD, LeaseReturnStatus> = {
  send_info: 'info_sent',
  send_reminder_1: 'reminder_1_sent',
  send_reminder_2: 'reminder_2_sent',
  escalate: 'escalated',
}
registerResolver<LeaseReturnRow>(LR, 'send_next_mail', (ctx) => {
  const action = LEASE_CHAIN[ctx.row.status]
  if (!action) return fail('transition_not_allowed', 'No mail is due in this status.')
  return leaseContactEmail(ctx) ?? { to: LEASE_TARGET[action], action }
})
registerValidator<LeaseReturnRow>(LR, 'link_service_request', ({ payload }) => {
  const number =
    typeof payload.serviceRequestNumber === 'string'
      ? payload.serviceRequestNumber.trim().toUpperCase()
      : ''
  if (!/^SR\d{7}$/.test(number))
    return { serviceRequestNumber: ['Enter an SR number like SR0012345.'] }
  return db.collection('service_requests').find((sr) => sr.number === number)
    ? null
    : { serviceRequestNumber: [`${number} does not exist.`] }
})
registerEffect<LeaseReturnRow>(LR, 'link_service_request', ({ update, payload, now }) => {
  const number = String(payload.serviceRequestNumber).trim().toUpperCase()
  const sr = db.collection('service_requests').find((s) => s.number === number)
  update({ serviceRequestId: sr?.id ?? null, linkedAt: now })
})
registerResolver<LeaseReturnRow>(LR, 'unlink_service_request', ({ row }) => ({
  to: restoredLeaseStatus({ ...row, serviceRequestId: null }),
}))
registerEffect<LeaseReturnRow>(LR, 'unlink_service_request', ({ update }) =>
  update({ serviceRequestId: null, linkedAt: null }),
)
registerEffect<LeaseReturnRow>(LR, 'close', ({ update, now, comment }) =>
  update({ closedAt: now, closeReason: comment }),
)
registerResolver<LeaseReturnRow>(LR, 'reopen', ({ row }) => ({ to: restoredLeaseStatus(row) }))
registerEffect<LeaseReturnRow>(LR, 'reopen', ({ update }) =>
  update({ closedAt: null, closeReason: null }),
)
registerResolver<LeaseReturnRow>(LR, 'pause_communication', () => ({ to: null }))
registerResolver<LeaseReturnRow>(LR, 'resume_communication', () => ({ to: null }))
registerValidator<LeaseReturnRow>(LR, 'pause_communication', ({ payload }) =>
  typeof payload.reason === 'string' && payload.reason.trim()
    ? null
    : { reason: ['A reason is required.'] },
)
registerEffect<LeaseReturnRow>(LR, 'pause_communication', ({ update, payload }) => {
  const resumeDate = typeof payload.resumeDate === 'string' ? payload.resumeDate : null
  update({
    communicationPaused: resumeDate === null,
    communicationResumeDate: resumeDate,
    communicationPauseReason: typeof payload.reason === 'string' ? payload.reason : null,
  })
})
registerEffect<LeaseReturnRow>(LR, 'resume_communication', ({ update, today }) =>
  update({
    communicationPaused: false,
    communicationResumeDate: today,
    communicationPauseReason: null,
  }),
)

// ---- assets ---------------------------------------------------------------------------------------

const AS = 'asset'
type AssetCtx = ActionContext<AssetRow>

registerEffect<AssetRow>(AS, 'mark_missing', ({ updated, from, actor, trigger, payload }) => {
  // The engine already wrote the status; record the movement (location unchanged).
  db.collection('asset_movements').insert({
    assetId: updated.id,
    action: 'mark_missing',
    fromStatus: from as AssetStatus,
    toStatus: 'missing',
    fromLocationId: updated.locationId,
    toLocationId: updated.locationId,
    fromInstallationPlace: updated.installationPlace,
    toInstallationPlace: updated.installationPlace,
    serviceRequestId: updated.serviceRequestId,
    actorUserId: actor?.id ?? null,
    trigger,
    reason: typeof payload.reason === 'string' ? payload.reason : null,
    sourceRef: null,
    occurredAt: new Date().toISOString(),
  })
})
registerValidator<AssetRow>(AS, 'mark_found', ({ payload }) =>
  typeof payload.locationId === 'number' && db.collection('stock_locations').has(payload.locationId)
    ? null
    : { locationId: ['Choose the location where the device was found.'] },
)
registerResolver<AssetRow>(AS, 'mark_found', ({ payload }: AssetCtx) => {
  const location = db.collection('stock_locations').get(Number(payload.locationId))
  return { to: location?.type === 'return' ? 'collected' : 'available' }
})
registerEffect<AssetRow>(AS, 'mark_found', ({ updated, from, actor, trigger, payload }) => {
  const restore = db.collection('assets').update(updated.id, { status: from as AssetStatus })
  if (!restore) return
  moveAsset(updated.id, 'mark_found', {
    toStatus: updated.status,
    toLocationId: Number(payload.locationId),
    installationPlace:
      typeof payload.installationPlace === 'string' ? payload.installationPlace : null,
    actor,
    trigger,
  })
})
registerValidator<AssetRow>(AS, 'correct', ({ payload }) =>
  typeof payload.reason === 'string' && payload.reason.trim()
    ? null
    : { reason: ['A reason is required.'] },
)
registerResolver<AssetRow>(AS, 'correct', ({ row, payload }: AssetCtx) => ({
  to: typeof payload.status === 'string' ? payload.status : row.status,
}))
registerEffect<AssetRow>(AS, 'correct', ({ updated, from, actor, trigger, payload }) => {
  db.collection('assets').update(updated.id, { status: from as AssetStatus })
  moveAsset(updated.id, 'correct', {
    toStatus: updated.status,
    toLocationId: typeof payload.locationId === 'number' ? payload.locationId : undefined,
    installationPlace:
      payload.installationPlace === undefined
        ? undefined
        : typeof payload.installationPlace === 'string'
          ? payload.installationPlace
          : null,
    actor,
    trigger,
    reason: typeof payload.reason === 'string' ? payload.reason : null,
  })
})

/** Today + n days (business date) helper for slice seeds and effects. */
export function businessDatePlus(days: number): string {
  return addDays(businessToday(), days)
}
