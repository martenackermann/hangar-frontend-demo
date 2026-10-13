import type { ImportJobStatus, ImportType } from '@/lib/api/types'
import type { MockActor } from '@/mocks/auth'
import type {
  AssetRow,
  ContactRow,
  LeaseReturnRow,
  ServiceRequestItemRow,
  ServiceRequestRow,
} from '@/mocks/core/tables'
import { locationOf, moveAsset } from '@/mocks/core/workflow'
import { db, type CollectionName } from '@/mocks/db'
import { applyAction } from '@/mocks/workflow'
import { emptyPostProcess } from '../tables'
import { OLD_DEVICE_STOCKROOM } from './formats'
import { leaseIsCampus, regionColumns, REGION_MUTABLE_STATUSES } from './region'
import { hasErrors, hasWarnings, issue, type Issue, type Row, type Validation } from './validate'

/**
 * Mock import appliers + post-processing (SPEC §7.3–§7.7, §6.4, §6.5), a compact port of the
 * backend's `importing/appliers/*` and `processor.py`. A row either applies completely or
 * raises `RowError` before writing; dry runs restore the touched tables afterwards.
 */
export class RowError extends Error {
  readonly issue: Issue

  constructor(detail: Issue) {
    super(detail.message)
    this.issue = detail
  }
}

type Outcome = 'created' | 'updated' | 'unchanged' | 'skipped'

export interface ImportCountsRow {
  processed: number
  created: number
  updated: number
  unchanged: number
  skipped: number
  errors: number
  warnings: number
}

export interface RunResult {
  status: ImportJobStatus
  counts: ImportCountsRow
  postProcess: Record<string, number>
  failure: string | null
}

const HOLD_GROUP = 'rollout hardware hold'
const SR_TERMINAL = new Set(['completed', 'cancelled'])
const HOLD_FROM = new Set([
  'imported',
  'invited',
  'campus_info_sent',
  'reminder_1_sent',
  'reminder_2_sent',
  'escalated',
])
const LINKABLE = new Set([
  'imported',
  'imported_vip',
  'info_sent',
  'reminder_1_sent',
  'reminder_2_sent',
  'escalated',
  'probably_closed',
])
const MARK_MISSING_FROM = new Set([
  'imported',
  'imported_vip',
  'info_sent',
  'reminder_1_sent',
  'reminder_2_sent',
  'escalated',
])
const NEW_SLOTS = [
  ['new_base', 'new_base', 'New base device type'],
  ['new_peripheral_1', 'new_peripheral_1', 'New peripheral 1 type'],
  ['new_peripheral_2', 'new_peripheral_2', 'New peripheral 2 type'],
] as const
const OLD_SLOTS = [
  ['old_base', 'old_base'],
  ['old_peripheral_1', 'old_peripheral_1'],
  ['old_peripheral_2', 'old_peripheral_2'],
] as const
const TOUCHED: CollectionName[] = [
  'contacts',
  'service_requests',
  'service_request_items',
  'lease_returns',
  'status_transitions',
  'assets',
  'asset_movements',
]

interface Ctx {
  jobId: number
  type: ImportType
  options: { dryRun?: boolean; targetLocationId?: number; markMissingAsProbablyClosed?: boolean }
  actor: MockActor | null
  now: string
  warnings: Issue[]
  stats: {
    contactsCreated: Set<string>
    contactsUpdated: Set<string>
    srIds: Set<number>
    leaseIds: Set<number>
    reopen: Set<number>
    changedContacts: Set<number>
    linked: number
    cancelled: number
    holdCandidates: number
  }
}

const isHoldGroup = (group: string | null) => (group ?? '').trim().toLowerCase() === HOLD_GROUP

function warn(ctx: Ctx, code: string, message: string, column: string | null = null, raw: unknown = null) {
  ctx.warnings.push(issue('warning', code, message, column, raw))
}

/** Set non-null values that differ; returns the changed keys. */
function changes<T extends object>(current: T, values: Partial<T>): Partial<T> {
  const patch: Partial<T> = {}
  for (const [key, value] of Object.entries(values) as [keyof T, T[keyof T]][]) {
    if (value === null || value === undefined) continue
    if (JSON.stringify(current[key]) !== JSON.stringify(value)) patch[key] = value
  }
  return patch
}

function transitionRow(
  entityType: 'service_request' | 'lease_return',
  entityId: number,
  to: string,
  ctx: Ctx,
) {
  db.collection('status_transitions').insert({
    entityType,
    entityId,
    action: 'import_create',
    fromStatus: null,
    toStatus: to,
    actorUserId: ctx.actor?.id ?? null,
    trigger: 'import',
    comment: null,
    payload: null,
    occurredAt: ctx.now,
  })
}

const isVip = (userId: string) => db.collection('vip_entries').find((v) => v.userId === userId) !== undefined

// ---- contacts ---------------------------------------------------------------------------------

function upsertContact(ctx: Ctx, userId: string, values: Partial<ContactRow>): [ContactRow, boolean] {
  const contacts = db.collection('contacts')
  const existing = contacts.find((c) => c.userId === userId)
  if (!existing) {
    const created = contacts.insert({
      userId,
      gender: values.gender ?? 'unspecified',
      firstName: values.firstName ?? null,
      lastName: values.lastName ?? userId,
      email: values.email ?? null,
      phone: values.phone ?? null,
      mobile: values.mobile ?? null,
      department: values.department ?? null,
      street: values.street ?? null,
      zip: values.zip ?? null,
      city: values.city ?? null,
      building: values.building ?? null,
      room: values.room ?? null,
      isActive: true,
    })
    ctx.stats.contactsCreated.add(userId)
    ctx.stats.changedContacts.add(created.id)
    return [created, true]
  }
  const patch = changes(existing, values)
  if (Object.keys(patch).length === 0) return [existing, false]
  if (!ctx.stats.contactsCreated.has(userId)) ctx.stats.contactsUpdated.add(userId)
  ctx.stats.changedContacts.add(existing.id)
  return [contacts.update(existing.id, patch)!, true]
}

const personOf = (v: Record<string, unknown>): Partial<ContactRow> => ({
  gender: (v.gender as ContactRow['gender'] | null) ?? undefined,
  firstName: (v.first_name as string | null) ?? undefined,
  lastName: (v.last_name as string | null) ?? undefined,
  email: (v.email as string | null) ?? undefined,
})

// ---- service requests --------------------------------------------------------------------------

function articleFor(requested: string) {
  const key = requested.trim().toLowerCase()
  return db.collection('articles').find((a) => a.isActive && a.internalDescription.toLowerCase() === key)
}

function srFields(v: Record<string, unknown>): Partial<ServiceRequestRow> {
  const d = (v.order_details ?? {}) as Record<string, unknown>
  const a = (v.delivery_address ?? {}) as Record<string, unknown>
  const software = d.requested_software as string[] | null
  return {
    taskNumber: v.task_number as string | null,
    itsmState: v.itsm_state as string | null,
    assignmentGroup: v.assignment_group as string | null,
    openedAt: v.opened_at as string | null,
    catalogItem: v.catalog_item as string | null,
    shortDescription: v.short_description as string | null,
    costCenter: v.cost_center as string | null,
    procurementType: d.procurement_type as ServiceRequestRow['procurementType'],
    scopeOfDelivery: d.scope_of_delivery as string | null,
    clientComponent: d.client_component as string | null,
    requestedSoftware: software?.length ? software : (null as unknown as string[]),
    note: d.note as string | null,
    onsiteContactPhone: d.onsite_contact_phone as string | null,
    deliveryRoom: a.room as string | null,
    deliveryBuilding: a.building as string | null,
    deliveryStreet: a.street as string | null,
    deliveryZip: a.zip as string | null,
    deliveryCity: a.city as string | null,
    deliveryCountry: a.country as string | null,
  }
}

function linkLeases(ctx: Ctx, sr: ServiceRequestRow): boolean {
  const tags = db
    .collection('service_request_items')
    .filter((i) => i.serviceRequestId === sr.id && i.slot.startsWith('old_') && i.expectedAssetTag !== null)
    .map((i) => i.expectedAssetTag!)
  let linked = false
  for (const lease of db.collection('lease_returns').filter((l) => tags.includes(l.assetTag))) {
    if (lease.status === 'replacement_ordered') {
      if (lease.serviceRequestId !== null && lease.serviceRequestId !== sr.id) {
        warn(
          ctx,
          'lease_already_linked',
          `Lease return ${lease.assetTag} is already linked to another service request.`,
          'order_details',
          lease.assetTag,
        )
      }
      continue
    }
    if (!LINKABLE.has(lease.status)) continue
    const result = applyAction<LeaseReturnRow>('leaseReturn', lease.id, 'link_service_request', {
      actor: ctx.actor,
      trigger: 'import',
      payload: { serviceRequestNumber: sr.number },
    })
    if (result.ok) {
      ctx.stats.linked++
      linked = true
    }
  }
  return linked
}

function cancelByItsm(ctx: Ctx, sr: ServiceRequestRow) {
  const result = applyAction('serviceRequest', sr.id, 'cancel', {
    actor: ctx.actor,
    trigger: 'import',
    payload: { comment: 'Cancelled in ITSM' },
  })
  if (result.ok) ctx.stats.cancelled++
}

function newItem(ctx: Ctx, srId: number, slot: string, label: string, requested: string) {
  const article = articleFor(requested)
  if (!article) {
    warn(
      ctx,
      'unknown_article',
      `Device type '${requested}' is not in the article catalogue.`,
      `order_details.${label}`,
      requested,
    )
  }
  return {
    serviceRequestId: srId,
    slot: slot as ServiceRequestItemRow['slot'],
    requestedType: requested,
    articleId: article?.id ?? null,
    expectedAssetTag: null,
    assetId: null,
    assignedAt: null,
    assignedBy: null,
    packedAt: null,
    packedBy: null,
    verifiedAt: null,
    verifiedBy: null,
    verifiedSerial: null,
  }
}

function oldItem(srId: number, slot: string, tag: string) {
  const asset = db.collection('assets').find((a) => a.assetTag === tag)
  return {
    ...newItemShape(srId, slot),
    expectedAssetTag: tag,
    assetId: asset?.id ?? null,
  }
}

function newItemShape(srId: number, slot: string): Omit<ServiceRequestItemRow, 'id'> {
  return {
    serviceRequestId: srId,
    slot: slot as ServiceRequestItemRow['slot'],
    requestedType: null,
    articleId: null,
    expectedAssetTag: null,
    assetId: null,
    assignedAt: null,
    assignedBy: null,
    packedAt: null,
    packedBy: null,
    verifiedAt: null,
    verifiedBy: null,
    verifiedSerial: null,
  }
}

function applyServiceRequest(ctx: Ctx, row: Row): Outcome {
  const v = row.values
  const details = (v.order_details ?? {}) as Record<string, string | null>
  const [contact, contactChanged] = upsertContact(ctx, v.user_id as string, personOf(v))
  if (!contact.email) {
    warn(ctx, 'email_missing', 'The contact has no email address; automatic mails cannot be sent.', 'email')
  }
  const fields = srFields(v)
  const srs = db.collection('service_requests')
  const items = db.collection('service_request_items')
  const existing = srs.find((s) => s.number === row.key)
  if (!existing) {
    const base: Omit<ServiceRequestRow, 'id'> = {
      number: row.key!,
      taskNumber: null,
      itsmState: null,
      assignmentGroup: null,
      openedAt: null,
      catalogItem: null,
      shortDescription: null,
      contactId: contact.id,
      costCenter: null,
      procurementType: null,
      scopeOfDelivery: null,
      clientComponent: null,
      requestedSoftware: [],
      addedSoftware: [],
      installedSoftware: [],
      note: null,
      onsiteContactPhone: null,
      deliveryRoom: null,
      deliveryBuilding: null,
      deliveryStreet: null,
      deliveryZip: null,
      deliveryCity: null,
      deliveryCountry: 'Freeland',
      regionId: null,
      regionRuleId: null,
      regionOverridden: false,
      supplyingSiteId: null,
      deliveryType: null,
      deliveryTypeOverride: null,
      isCampus: false,
      isVip: isVip(contact.userId),
      status: 'imported',
      statusChangedAt: ctx.now,
      resumeStatus: null,
      communicationDate: null,
      communicationPaused: false,
      communicationPauseReason: null,
      communicationResumeDate: null,
      hardwareUnavailableNotifiedAt: null,
      holdSource: null,
      editorUserId: null,
      claimedAt: null,
      withoutAssetPrep: false,
      osReinstall: null,
      appointmentStartAt: null,
      appointmentEndAt: null,
      appointmentCalendarId: null,
      appointmentCalendarName: null,
      deviationCodeId: null,
      deviationComment: null,
      importedAt: ctx.now,
      lastImportedAt: ctx.now,
      lastImportJobId: ctx.jobId,
      personalizedAt: null,
      orderClosedAt: null,
      providedAt: null,
      shippedAt: null,
      completedAt: null,
      cancelledAt: null,
      protocolFileId: null,
      version: 1,
    }
    const values = { ...base, ...Object.fromEntries(Object.entries(fields).filter(([, x]) => x !== null && x !== undefined)) }
    values.status = values.isVip ? 'imported_vip' : 'imported'
    const region = regionColumns({ ...values, status: values.status }, true)!
    if (region.regionId === null) {
      warn(ctx, 'region_unresolved', 'No region rule matched the delivery address; the request stays unresolved.', 'delivery_address')
    }
    const sr = srs.insert({ ...values, ...region } as Omit<ServiceRequestRow, 'id'>)
    for (const [slot, key, label] of NEW_SLOTS) {
      const requested = details[key]
      if (requested) items.insert(newItem(ctx, sr.id, slot, label, requested))
    }
    for (const [slot, key] of OLD_SLOTS) {
      const tag = details[key]
      if (tag) items.insert(oldItem(sr.id, slot, tag))
    }
    transitionRow('service_request', sr.id, sr.status, ctx)
    ctx.stats.srIds.add(sr.id)
    if (sr.itsmState === 'Cancelled') cancelByItsm(ctx, sr)
    else {
      linkLeases(ctx, sr)
      if (isHoldGroup(sr.assignmentGroup) && HOLD_FROM.has(sr.status)) ctx.stats.holdCandidates++
    }
    return 'created'
  }

  const changed = new Set(Object.keys(changes(existing, fields)))
  let sr = srs.update(existing.id, {
    ...changes(existing, fields),
    ...(existing.contactId !== contact.id ? { contactId: contact.id, isVip: isVip(contact.userId) } : {}),
    lastImportedAt: ctx.now,
    lastImportJobId: ctx.jobId,
  })!
  if (existing.contactId !== contact.id) changed.add('contactId')
  const terminal = SR_TERMINAL.has(sr.status)
  const mutable = REGION_MUTABLE_STATUSES.has(sr.status)
  const regionInputs = ['deliveryStreet', 'deliveryZip', 'deliveryCity', 'deliveryCountry', 'costCenter', 'procurementType']
  if (!terminal && regionInputs.some((k) => changed.has(k))) {
    const region = regionColumns(sr)
    if (region) {
      const patch = changes(sr, region as Partial<ServiceRequestRow>)
      if (region.regionId === null && sr.regionId !== null) patch.regionId = null
      if (Object.keys(patch).length) {
        sr = srs.update(sr.id, { ...region })!
        changed.add('region')
      }
      if (mutable && region.regionId === null) {
        warn(ctx, 'region_unresolved', 'No region rule matched the delivery address; the request stays unresolved.', 'delivery_address')
      }
    }
  }
  // items (re-synced only while the region may still change — SPEC_RESOLUTIONS #29)
  const current = items.filter((i) => i.serviceRequestId === sr.id)
  const itemChanges: string[] = []
  for (const [slot, key, label] of NEW_SLOTS) {
    const item = current.find((i) => i.slot === slot)
    const wanted = details[key] ?? null
    if (!wanted) {
      if (item && item.assetId === null) {
        itemChanges.push(slot)
        if (mutable) items.remove(item.id)
      }
    } else if (!item) {
      itemChanges.push(slot)
      if (mutable) items.insert(newItem(ctx, sr.id, slot, label, wanted))
    } else if ((item.requestedType ?? '').toLowerCase() !== wanted.toLowerCase()) {
      itemChanges.push(slot)
      if (mutable) {
        const replacement = newItem(ctx, sr.id, slot, label, wanted)
        items.update(item.id, { requestedType: wanted, articleId: replacement.articleId })
      }
    }
  }
  for (const [slot, key] of OLD_SLOTS) {
    const item = current.find((i) => i.slot === slot)
    const wanted = details[key] ?? null
    if (!wanted) {
      if (item && item.assetId === null) {
        itemChanges.push(slot)
        if (mutable) items.remove(item.id)
      }
    } else if (!item) {
      itemChanges.push(slot)
      if (mutable) items.insert(oldItem(sr.id, slot, wanted))
    } else if (item.expectedAssetTag !== wanted && item.verifiedAt === null) {
      itemChanges.push(slot)
      if (mutable) {
        const asset = db.collection('assets').find((a) => a.assetTag === wanted)
        items.update(item.id, { expectedAssetTag: wanted, assetId: asset?.id ?? null })
      }
    }
  }
  if (itemChanges.length && !mutable) {
    warn(
      ctx,
      'items_locked',
      `Item changes were ignored because the request is already '${sr.status}' (${itemChanges.sort().join(', ')}).`,
      'order_details',
    )
  } else if (itemChanges.length) {
    changed.add('items')
  }
  if (!terminal) {
    if (sr.itsmState === 'Cancelled') {
      cancelByItsm(ctx, sr)
      changed.add('status')
    } else {
      if (linkLeases(ctx, sr)) changed.add('lease')
      if (isHoldGroup(sr.assignmentGroup) && HOLD_FROM.has(sr.status) && changed.size) ctx.stats.holdCandidates++
    }
  }
  if (changed.size || contactChanged) {
    ctx.stats.srIds.add(sr.id)
    return 'updated'
  }
  return 'unchanged'
}

function postServiceRequests(ctx: Ctx): Record<string, number> {
  let hold = 0
  if (ctx.options.dryRun) hold = ctx.stats.holdCandidates
  else {
    for (const id of ctx.stats.srIds) {
      const sr = db.collection('service_requests').get(id)
      if (!sr || !HOLD_FROM.has(sr.status) || !isHoldGroup(sr.assignmentGroup)) continue
      const result = applyAction('serviceRequest', id, 'mark_hardware_unavailable', {
        actor: ctx.actor,
        trigger: 'import',
      })
      if (result.ok) {
        db.collection('service_requests').update(id, { holdSource: 'import' })
        hold++
      }
    }
  }
  return {
    hardwareHold: hold,
    cancelledByItsm: ctx.stats.cancelled,
    leaseReturnsLinked: ctx.stats.linked,
    contactsCreated: ctx.stats.contactsCreated.size,
    contactsUpdated: ctx.stats.contactsUpdated.size,
  }
}

// ---- lease returns ----------------------------------------------------------------------------

function applyLease(ctx: Ctx, row: Row): Outcome {
  const v = row.values
  const userId = v.user_id as string
  const [contact, contactChanged] = upsertContact(ctx, userId, personOf(v))
  if (!contact.email) {
    warn(ctx, 'email_missing', 'The contact has no email address; lease mails cannot be sent.', 'email')
  }
  const fields: Partial<LeaseReturnRow> = {
    serialNumber: v.serial_number as string | null,
    modelCategory: v.model_category as string | null,
    checkedInAt: v.checked_in_date as string | null,
    retirementDate: v.retirement_date as string,
    model: v.model as string | null,
    installStatus: v.install_status as string | null,
    ciName: v.ci_name as string | null,
    costCenter: v.cost_center as string | null,
    escalationEmail: v.escalation_email as string | null,
  }
  const leases = db.collection('lease_returns')
  const existing = leases.find((l) => l.assetTag === row.key)
  if (!existing) {
    const vip = isVip(userId)
    const lease = leases.insert({
      assetTag: row.key!,
      serialNumber: null,
      modelCategory: null,
      model: null,
      checkedInAt: null,
      retirementDate: fields.retirementDate!,
      userId,
      contactId: contact.id,
      installStatus: null,
      ciName: null,
      costCenter: null,
      isVip: vip,
      isCampus: false,
      status: vip ? 'imported_vip' : 'imported',
      statusChangedAt: ctx.now,
      communicationDate: null,
      communicationPaused: false,
      communicationPauseReason: null,
      communicationResumeDate: null,
      infoSentAt: null,
      reminder1SentAt: null,
      reminder2SentAt: null,
      escalationSentAt: null,
      escalationEmail: null,
      serviceRequestId: null,
      linkedAt: null,
      closedAt: null,
      closeReason: null,
      importedAt: ctx.now,
      lastSeenAt: ctx.now,
      lastImportJobId: ctx.jobId,
      version: 1,
      ...Object.fromEntries(Object.entries(fields).filter(([, x]) => x !== null && x !== undefined)),
    } as Omit<LeaseReturnRow, 'id'>)
    leases.update(lease.id, { isCampus: leaseIsCampus(contact.id, lease.costCenter) })
    transitionRow('lease_return', lease.id, lease.status, ctx)
    ctx.stats.leaseIds.add(lease.id)
    return 'created'
  }
  const patch = changes(existing, fields)
  if (existing.userId !== userId || existing.contactId !== contact.id) {
    Object.assign(patch, { userId, contactId: contact.id, isVip: isVip(userId) })
  }
  const merged = { ...existing, ...patch }
  const campus = leaseIsCampus(merged.contactId, merged.costCenter)
  if (campus !== existing.isCampus) patch.isCampus = campus
  leases.update(existing.id, { ...patch, lastSeenAt: ctx.now, lastImportJobId: ctx.jobId })
  ctx.stats.leaseIds.add(existing.id)
  let changed = Object.keys(patch).length > 0
  if (existing.status === 'probably_closed') {
    ctx.stats.reopen.add(existing.id)
    changed = true
  }
  return changed || contactChanged ? 'updated' : 'unchanged'
}

function postLeases(ctx: Ctx, seen: Set<string>, complete: boolean): Record<string, number> {
  let reopened = 0
  let linked = 0
  let probablyClosed = 0
  if (ctx.options.dryRun) reopened = ctx.stats.reopen.size
  else {
    for (const id of ctx.stats.reopen) {
      const lease = db.collection('lease_returns').get(id)
      if (lease?.status !== 'probably_closed') continue
      if (applyAction('leaseReturn', id, 'reopen', { actor: ctx.actor, trigger: 'import' }).ok) reopened++
    }
    // late lease imports also run linking (SPEC_RESOLUTIONS #55)
    for (const id of ctx.stats.leaseIds) {
      const lease = db.collection('lease_returns').get(id)
      if (!lease || !LINKABLE.has(lease.status)) continue
      const item = db
        .collection('service_request_items')
        .filter((i) => i.expectedAssetTag === lease.assetTag)
        .map((i) => db.collection('service_requests').get(i.serviceRequestId))
        .filter((sr): sr is ServiceRequestRow => sr !== undefined && !SR_TERMINAL.has(sr.status))
        .sort((a, b) => b.importedAt.localeCompare(a.importedAt) || b.id - a.id)[0]
      if (!item) continue
      const result = applyAction('leaseReturn', id, 'link_service_request', {
        actor: ctx.actor,
        trigger: 'import',
        payload: { serviceRequestNumber: item.number },
      })
      if (result.ok) linked++
    }
  }
  if (ctx.options.markMissingAsProbablyClosed && complete) {
    for (const lease of db.collection('lease_returns').filter((l) => MARK_MISSING_FROM.has(l.status))) {
      if (seen.has(lease.assetTag)) continue
      if (!ctx.options.dryRun) {
        applyAction('leaseReturn', lease.id, 'mark_probably_closed', { actor: ctx.actor, trigger: 'import' })
      }
      probablyClosed++
    }
  }
  return {
    reopened,
    leaseReturnsLinked: linked,
    probablyClosed,
    contactsCreated: ctx.stats.contactsCreated.size,
    contactsUpdated: ctx.stats.contactsUpdated.size,
  }
}

// ---- contacts ---------------------------------------------------------------------------------

function applyContact(ctx: Ctx, row: Row): Outcome {
  const v = row.values
  const created = !db.collection('contacts').find((c) => c.userId === row.key)
  const [contact, changed] = upsertContact(ctx, row.key!, {
    ...personOf(v),
    phone: (v.phone as string | null) ?? undefined,
    mobile: (v.mobile as string | null) ?? undefined,
    department: (v.department as string | null) ?? undefined,
    street: (v.street as string | null) ?? undefined,
    zip: (v.zip as string | null) ?? undefined,
    city: (v.city as string | null) ?? undefined,
    building: (v.building as string | null) ?? undefined,
    room: (v.room as string | null) ?? undefined,
  })
  if (!contact.email) warn(ctx, 'email_missing', 'The contact has no email address.', 'email')
  return created ? 'created' : changed ? 'updated' : 'unchanged'
}

function postContacts(ctx: Ctx): Record<string, number> {
  if (!ctx.options.dryRun) {
    for (const lease of db.collection('lease_returns').filter(
      (l) => l.contactId !== null && ctx.stats.changedContacts.has(l.contactId) && l.status !== 'closed',
    )) {
      const campus = leaseIsCampus(lease.contactId, lease.costCenter)
      if (campus !== lease.isCampus) db.collection('lease_returns').update(lease.id, { isCampus: campus })
    }
  }
  return {
    contactsCreated: ctx.stats.contactsCreated.size,
    contactsUpdated: ctx.stats.contactsUpdated.size,
  }
}

// ---- assets -----------------------------------------------------------------------------------

function articleForModel(ctx: Ctx, model: string | null) {
  if (!model) return undefined
  const article = db.collection('articles').find((a) => a.modelNumber.toLowerCase() === model.trim().toLowerCase())
  if (!article) {
    warn(ctx, 'unknown_model', `Model '${model}' is not in the article catalogue; the asset has no article.`, 'model', model)
  }
  return article
}

function checkTag(tag: string | null, serial: string) {
  if (!tag) return
  const other = db.collection('assets').find((a) => a.assetTag === tag)
  if (other && other.serialNumber !== serial) {
    throw new RowError(
      issue('error', 'asset_tag_conflict', `Asset tag ${tag} already belongs to serial ${other.serialNumber}.`, 'asset_tag', tag),
    )
  }
}

function createAsset(
  ctx: Ctx,
  fields: Omit<AssetRow, 'id' | 'version' | 'createdAt' | 'statusChangedAt'>,
  action: 'receive' | 'sync_in_use' | 'sync_collected',
): AssetRow {
  const asset = db.collection('assets').insert({
    ...fields,
    statusChangedAt: ctx.now,
    version: 1,
    createdAt: ctx.now,
  })
  db.collection('asset_movements').insert({
    assetId: asset.id,
    action,
    fromStatus: null,
    toStatus: asset.status,
    fromLocationId: null,
    toLocationId: asset.locationId,
    fromInstallationPlace: null,
    toInstallationPlace: asset.installationPlace,
    serviceRequestId: asset.serviceRequestId,
    actorUserId: ctx.actor?.id ?? null,
    trigger: 'import',
    reason: null,
    sourceRef: `import:${ctx.jobId}`,
    occurredAt: ctx.now,
  })
  return asset
}

const assetFields = (v: Record<string, unknown>) => ({
  assetTag: v.asset_tag as string | null,
  model: v.model as string | null,
  externalAssetId: v.external_asset_id as string | null,
  ciName: v.ci_name as string | null,
  orderNumber: v.order_number as string | null,
  macAddress: v.mac_address as string | null,
  checkedInAt: v.checked_in_date as string | null,
})

function applyAssetNew(ctx: Ctx, row: Row): Outcome {
  const v = row.values
  const serial = row.key!
  const targetId = Number(ctx.options.targetLocationId)
  checkTag(v.asset_tag as string | null, serial)
  const asset = db.collection('assets').find((a) => a.serialNumber === serial)
  if (asset && (asset.status !== 'available' || asset.serviceRequestId !== null)) {
    throw new RowError(
      issue(
        'error',
        'asset_in_use',
        `Serial ${serial} already exists and is '${asset.status}'; it cannot be received again.`,
        'serial_number',
        serial,
      ),
    )
  }
  const article = articleForModel(ctx, v.model as string | null)
  const fields = assetFields(v)
  if (!asset) {
    createAsset(
      ctx,
      {
        serialNumber: serial,
        articleId: article?.id ?? null,
        assetTag: fields.assetTag,
        model: fields.model,
        externalAssetId: fields.externalAssetId,
        ciName: fields.ciName,
        orderNumber: fields.orderNumber,
        macAddress: fields.macAddress,
        checkedInAt: fields.checkedInAt ?? ctx.now,
        status: 'available',
        locationId: targetId,
        installationPlace: null,
        serviceRequestId: null,
        assignedContactId: null,
        source: 'import_new',
      },
      'receive',
    )
    return 'created'
  }
  const patch = changes(asset, { ...fields, ...(article ? { articleId: article.id } : {}) })
  if (Object.keys(patch).length) db.collection('assets').update(asset.id, patch)
  if (asset.locationId !== targetId) {
    moveAsset(asset.id, 'receive', {
      toStatus: 'available',
      toLocationId: targetId,
      installationPlace: null,
      actor: ctx.actor,
      trigger: 'import',
      sourceRef: `import:${ctx.jobId}`,
    })
    return 'updated'
  }
  return Object.keys(patch).length ? 'updated' : 'unchanged'
}

function syncAction(state: string | null, stockroom: string | null): 'sync_in_use' | 'sync_collected' | null {
  const s = (state ?? '').trim().toLowerCase()
  if (s === 'in use') return 'sync_in_use'
  if (s === 'in transit') return 'sync_collected'
  if (s === 'in stock' && (stockroom ?? '').trim().toLowerCase() === OLD_DEVICE_STOCKROOM.toLowerCase())
    return 'sync_collected'
  return null
}

function applyStatusSync(ctx: Ctx, row: Row): Outcome {
  const v = row.values
  const serial = row.key!
  const action = syncAction(v.install_state as string | null, v.stockroom as string | null)
  if (!action) {
    warn(ctx, 'unmapped_state', `Install state '${String(v.install_state)}' is not synchronised; the row was skipped.`, 'install_state', v.install_state)
    return 'skipped'
  }
  const asset = db.collection('assets').find((a) => a.serialNumber === serial)
  if (asset && ['assigned', 'prepared', 'provided'].includes(asset.status)) {
    throw new RowError(issue('error', 'asset_in_workflow', `Serial ${serial} is reserved by a service request (${asset.status}).`, 'serial_number', serial))
  }
  if (asset?.status.startsWith('deactivated_')) {
    throw new RowError(issue('error', 'asset_deactivated', `Serial ${serial} has left the fleet (${asset.status}).`, 'serial_number', serial))
  }
  checkTag(v.asset_tag as string | null, serial)
  const srNumber = v.sr_number as string | null
  const sr = srNumber ? db.collection('service_requests').find((s) => s.number === srNumber) : undefined
  if (srNumber && !sr) {
    warn(ctx, 'sr_not_found', `Service request ${srNumber} is unknown; the device was synchronised without it.`, 'sr_number', srNumber)
  }
  const assignedUser = v.assigned_user_id as string | null
  const contact =
    action === 'sync_in_use' && assignedUser
      ? db.collection('contacts').find((c) => c.userId === assignedUser)
      : undefined
  if (action === 'sync_in_use' && assignedUser && !contact) {
    warn(ctx, 'unknown_contact', `User ${assignedUser} is not a known contact.`, 'assigned_user_id', assignedUser)
  }
  const article = articleForModel(ctx, v.model as string | null)
  const target = action === 'sync_in_use' ? 'in_use' : 'collected'
  const siteId = sr?.supplyingSiteId ?? db.collection('sites').find((s) => s.code === 'RIV')?.id ?? null
  const locationId = target === 'in_use' ? locationOf(null, 'in_use') : locationOf(siteId, 'return')
  let outcome: Outcome
  let current: AssetRow
  if (!asset) {
    const fields = assetFields(v)
    current = createAsset(
      ctx,
      {
        serialNumber: serial,
        articleId: article?.id ?? null,
        assetTag: fields.assetTag,
        model: fields.model,
        externalAssetId: fields.externalAssetId,
        ciName: fields.ciName,
        orderNumber: fields.orderNumber,
        macAddress: fields.macAddress,
        checkedInAt: fields.checkedInAt,
        status: target,
        locationId,
        installationPlace: null,
        serviceRequestId: sr?.id ?? null,
        assignedContactId: contact?.id ?? null,
        source: 'import_status_sync',
      },
      action,
    )
    outcome = 'created'
  } else {
    const patch = changes(asset, {
      ...assetFields(v),
      ...(article ? { articleId: article.id } : {}),
      ...(contact ? { assignedContactId: contact.id } : {}),
    })
    if (Object.keys(patch).length) db.collection('assets').update(asset.id, patch)
    if (asset.status !== target) {
      moveAsset(asset.id, action, {
        toStatus: target,
        toLocationId: locationId,
        installationPlace: null,
        ...(sr ? { serviceRequestId: sr.id } : {}),
        actor: ctx.actor,
        trigger: 'import',
        sourceRef: `import:${ctx.jobId}`,
      })
    }
    current = db.collection('assets').get(asset.id)!
    outcome = Object.keys(patch).length || asset.status !== target ? 'updated' : 'unchanged'
  }
  if (sr && target === 'collected' && current.assetTag) {
    for (const item of db.collection('service_request_items').filter(
      (i) => i.serviceRequestId === sr.id && i.slot.startsWith('old_') && i.expectedAssetTag === current.assetTag && i.assetId === null,
    )) {
      db.collection('service_request_items').update(item.id, { assetId: current.id })
      if (outcome === 'unchanged') outcome = 'updated'
    }
  }
  return outcome
}

// ---- runner -----------------------------------------------------------------------------------

const APPLIERS: Record<ImportType, (ctx: Ctx, row: Row) => Outcome> = {
  service_requests: applyServiceRequest,
  lease_returns: applyLease,
  contacts: applyContact,
  assets_new: applyAssetNew,
  asset_status_sync: applyStatusSync,
}

export function runValidation(
  jobId: number,
  type: ImportType,
  options: Ctx['options'],
  validation: Validation,
  actor: MockActor | null,
): RunResult {
  const snapshot = options.dryRun
    ? TOUCHED.map((name) => [name, db.collection(name).all()] as const)
    : []
  const ctx: Ctx = {
    jobId,
    type,
    options,
    actor,
    now: new Date().toISOString(),
    warnings: [],
    stats: {
      contactsCreated: new Set(),
      contactsUpdated: new Set(),
      srIds: new Set(),
      leaseIds: new Set(),
      reopen: new Set(),
      changedContacts: new Set(),
      linked: 0,
      cancelled: 0,
      holdCandidates: 0,
    },
  }
  const counts: ImportCountsRow = { processed: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, errors: 0, warnings: 0 }
  for (const row of validation.rows) {
    counts.processed++
    if (!hasErrors(row)) {
      ctx.warnings = []
      try {
        const outcome = APPLIERS[type](ctx, row)
        row.issues.push(...ctx.warnings)
        counts[outcome]++
      } catch (error) {
        if (!(error instanceof RowError)) throw error
        row.issues.push(error.issue)
      }
    }
    if (hasErrors(row)) counts.errors++
    if (hasWarnings(row)) counts.warnings++
  }
  const seen = new Set(validation.rows.map((r) => r.key).filter((k): k is string => k !== null))
  const post = {
    ...emptyPostProcess(),
    ...(type === 'service_requests'
      ? postServiceRequests(ctx)
      : type === 'lease_returns'
        ? postLeases(ctx, seen, true)
        : type === 'contacts'
          ? postContacts(ctx)
          : {}),
  }
  if (options.dryRun) {
    for (const [name, rows] of snapshot) {
      const collection = db.collection(name)
      collection.clear()
      collection.insertMany(rows as never)
    }
  }
  const total = validation.rows.length
  const status: ImportJobStatus =
    total > 0 && counts.errors >= total
      ? 'failed'
      : counts.errors > 0
        ? 'completed_with_errors'
        : 'completed'
  return {
    status,
    counts,
    postProcess: post,
    failure: status === 'failed' ? 'Every row has errors; nothing was imported.' : null,
  }
}
