import type { ItemSlot, ScanResult, ServiceRequestItem } from '@/lib/api/types'
import type { MockActor } from '@/mocks/auth'
import type { AssetRow, ServiceRequestItemRow, ServiceRequestRow } from '@/mocks/core/tables'
import { articleRef, itemsOf, srItem } from '@/mocks/core/read-models'
import { locationOf } from '@/mocks/core/workflow'
import { db } from '@/mocks/db'
import { problem, problems } from '@/mocks/http'
import {
  canExecuteTour,
  countedItems,
  ensureTourRunning,
  isNewSlot,
  ON_SITE,
  pendingStopOf,
  tourOfStop,
  tourStartableFailure,
} from './model'

/** Deployment scans, verification undo and unknown devices (SPEC §6.11, SPEC_RESOLUTIONS #26). */

const SLOT_LABEL: Record<string, string> = {
  new_base: 'New base device',
  new_peripheral_1: 'New peripheral 1',
  new_peripheral_2: 'New peripheral 2',
  old_base: 'Old base device',
  old_peripheral_1: 'Old peripheral 1',
  old_peripheral_2: 'Old peripheral 2',
}
const OLD_SLOTS: ItemSlot[] = ['old_base', 'old_peripheral_1', 'old_peripheral_2']

export const normalizeCode = (value: unknown) =>
  typeof value === 'string' ? value.trim().toUpperCase() : ''

export function canExecute(actor: MockActor): boolean {
  return (
    actor.permissions.includes('tours.execute_own') ||
    actor.permissions.includes('tours.execute_any')
  )
}

/** 403 unless the actor may work on the SR's pending stop (or holds `tours.execute_any`). */
export function stopAccess(sr: ServiceRequestRow, actor: MockActor, request: Request) {
  if (!canExecute(actor)) return problems.forbidden(undefined, request)
  const tour = tourOfStop(pendingStopOf(sr.id))
  if (tour ? canExecuteTour(actor, tour) : actor.permissions.includes('tours.execute_any'))
    return null
  return problem(403, 'not_own_tour', 'Not your tour', {
    detail: "This stop belongs to another technician's tour.",
    request,
  })
}

/** SR handed over + tour running or startable; starts a planned tour of today (#32). */
export function activeContext(
  sr: ServiceRequestRow,
  actor: MockActor,
  request: Request,
  today: string,
  now: string,
): Response | null {
  if (!ON_SITE.includes(sr.status))
    return problems.conflict(
      `Hardware not handed over yet (status: ${sr.status.replaceAll('_', ' ')}). Contact dispatch.`,
      request,
    )
  const denied = stopAccess(sr, actor, request)
  if (denied) return denied
  const failure = tourStartableFailure(sr.id, today)
  if (failure) return problems.conflict(failure.message, request)
  ensureTourRunning(sr.id, now)
  return null
}

function progress(srId: number) {
  const items = countedItems(srId)
  return { done: items.filter((i) => i.verifiedAt !== null).length, total: items.length }
}

function suggestedSlots(srId: number): ItemSlot[] {
  const old = itemsOf(srId).filter((i) => !isNewSlot(i.slot))
  const slots = old.filter((i) => i.verifiedAt === null).map((i) => i.slot)
  const free = OLD_SLOTS.find((slot) => !old.some((i) => i.slot === slot))
  return free ? [...slots, free] : slots
}

function verify(
  item: ServiceRequestItemRow,
  asset: AssetRow | undefined,
  value: string,
  actor: MockActor,
  now: string,
) {
  return db.collection('service_request_items').update(item.id, {
    assetId: item.assetId ?? asset?.id ?? null,
    verifiedAt: now,
    verifiedBy: actor.id,
    verifiedSerial: asset?.serialNumber ?? value,
  })
}

const matches = (asset: AssetRow | undefined, value: string) =>
  Boolean(asset) && (asset?.serialNumber === value || asset?.assetTag === value)

export function scanDeployment(
  sr: ServiceRequestRow,
  value: string,
  actor: MockActor,
  now: string,
): ScanResult<ServiceRequestItem> {
  const assets = db.collection('assets')
  const result = (
    verdict: ScanResult['verdict'],
    code: string,
    message: string,
    item?: ServiceRequestItemRow,
    options: { applied?: boolean; canRegister?: boolean } = {},
  ): ScanResult<ServiceRequestItem> => ({
    verdict,
    code,
    message,
    scannedValue: value,
    applied: options.applied ?? false,
    entity: item ? srItem(item) : null,
    undo:
      options.applied && item
        ? {
            method: 'DELETE',
            href: `/service-requests/${sr.id}/items/${item.slot}/verification`,
            body: null,
          }
        : null,
    progress: progress(sr.id),
    canRegister: options.canRegister ?? false,
    suggestedSlots: options.canRegister ? suggestedSlots(sr.id) : [],
  })
  const items = itemsOf(sr.id)
  const assetOf = (item: ServiceRequestItemRow) =>
    item.assetId ? assets.get(item.assetId) : undefined
  // 1. already verified (checked first, SPEC_RESOLUTIONS #26)
  for (const item of items) {
    if (item.verifiedAt && (item.verifiedSerial === value || matches(assetOf(item), value)))
      return result('ok', 'already_verified', `${SLOT_LABEL[item.slot]} already verified.`, item)
  }
  const asset = assets.find((a) => a.serialNumber === value || a.assetTag === value)
  // 2. a new item's asset
  for (const item of items.filter((i) => isNewSlot(i.slot))) {
    const linked = assetOf(item)
    if (linked && matches(linked, value)) {
      const updated = verify(item, linked, value, actor, now)
      const article = articleRef(linked.articleId)?.name ?? item.requestedType ?? 'Device'
      return result(
        'ok',
        'new_verified',
        `${SLOT_LABEL[item.slot]} verified: ${article} (${linked.assetTag ?? linked.serialNumber})`,
        updated,
        { applied: true },
      )
    }
  }
  // 3. an old item's asset, or an asset with an old item's expected tag
  for (const item of items.filter((i) => !isNewSlot(i.slot) && i.verifiedAt === null)) {
    const linked = assetOf(item)
    const expected =
      asset && item.expectedAssetTag && asset.assetTag === normalizeCode(item.expectedAssetTag)
    if ((linked && matches(linked, value)) || expected) {
      const target = linked && matches(linked, value) ? linked : asset
      const updated = verify(item, target, value, actor, now)
      return result(
        'ok',
        'old_verified',
        `${SLOT_LABEL[item.slot]} verified for collection: ${target?.assetTag ?? value}`,
        updated,
        { applied: true },
      )
    }
  }
  if (asset) {
    // 4. a new item of another request
    const other = db
      .collection('service_request_items')
      .find((i) => i.assetId === asset.id && isNewSlot(i.slot) && i.serviceRequestId !== sr.id)
    const otherSr = other
      ? db.collection('service_requests').get(other.serviceRequestId)
      : undefined
    if (otherSr)
      return result('error', 'belongs_to_other_sr', `Device belongs to ${otherSr.number}.`)
    // 5. not part of this request
    return result(
      'error',
      'not_on_this_request',
      'Device is not part of this request. Contact dispatch.',
    )
  }
  // 6. unknown device
  return result(
    'warning',
    'unknown_device',
    'Unknown device. Register it as an old device if you collect it.',
    undefined,
    { canRegister: true },
  )
}

export function undoVerification(
  sr: ServiceRequestRow,
  slot: string,
  request: Request,
): Response | ServiceRequestItemRow {
  const item = itemsOf(sr.id).find((i) => i.slot === slot)
  if (!item) return problems.notFound('Item', slot, request)
  const undoNotPossible = (detail: string) =>
    problem(409, 'undo_not_possible', 'Undo not possible', { detail, request })
  if (!item.verifiedAt) return undoNotPossible('This device is not verified.')
  const asset = item.assetId ? db.collection('assets').get(item.assetId) : undefined
  if (asset?.source === 'technician_scan' && asset.serviceRequestId === sr.id && !isNewSlot(slot))
    return undoNotPossible(
      'A registered device stays on the request; its verification cannot be undone.',
    )
  return db.collection('service_request_items').update(item.id, {
    verifiedAt: null,
    verifiedBy: null,
    verifiedSerial: null,
  })!
}

export function registerUnknown(
  sr: ServiceRequestRow,
  slot: string,
  body: { serial?: unknown; assetTag?: unknown; model?: unknown },
  actor: MockActor,
  request: Request,
  now: string,
): Response | ServiceRequestItemRow {
  if (isNewSlot(slot) || !OLD_SLOTS.includes(slot as ItemSlot))
    return problems.validation(
      { slot: ['Only old-device slots can take a registered device.'] },
      undefined,
      request,
    )
  const serial = normalizeCode(body.serial)
  const tag = normalizeCode(body.assetTag) || null
  if (!serial)
    return problems.validation({ serial: ['A serial number is required.'] }, undefined, request)
  const assets = db.collection('assets')
  const duplicate = assets.find(
    (a) => a.serialNumber === serial || (tag !== null && a.assetTag === tag),
  )
  if (duplicate)
    return problems.duplicate(
      `A device with this ${duplicate.serialNumber === serial ? 'serial' : 'asset tag'} already exists. Scan it instead.`,
      request,
    )
  const existing = itemsOf(sr.id).find((i) => i.slot === slot)
  if (existing?.verifiedAt) return problems.conflict('This slot is already verified.', request)
  const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : null
  const article = model
    ? db.collection('articles').find((a) => a.modelNumber.toLowerCase() === model.toLowerCase())
    : undefined
  const inUse = locationOf(null, 'in_use')
  const asset = assets.insert({
    serialNumber: serial,
    assetTag: tag,
    articleId: article?.id ?? null,
    model,
    externalAssetId: null,
    ciName: null,
    orderNumber: null,
    macAddress: null,
    status: 'in_use',
    locationId: inUse,
    installationPlace: null,
    serviceRequestId: sr.id,
    assignedContactId: sr.contactId,
    checkedInAt: null,
    source: 'technician_scan',
    statusChangedAt: now,
    version: 1,
    createdAt: now,
  })
  db.collection('asset_movements').insert({
    assetId: asset.id,
    action: 'register_unknown',
    fromStatus: null,
    toStatus: 'in_use',
    fromLocationId: null,
    toLocationId: inUse,
    fromInstallationPlace: null,
    toInstallationPlace: null,
    serviceRequestId: sr.id,
    actorUserId: actor.id,
    trigger: 'user',
    reason: null,
    sourceRef: 'scan:deployment',
    occurredAt: now,
  })
  const items = db.collection('service_request_items')
  const item =
    existing ??
    items.insert({
      serviceRequestId: sr.id,
      slot: slot as ItemSlot,
      requestedType: null,
      articleId: null,
      expectedAssetTag: tag,
      assetId: asset.id,
      assignedAt: null,
      assignedBy: null,
      packedAt: null,
      packedBy: null,
      verifiedAt: null,
      verifiedBy: null,
      verifiedSerial: null,
    })
  return items.update(item.id, {
    assetId: asset.id,
    verifiedAt: now,
    verifiedBy: actor.id,
    verifiedSerial: serial,
  })!
}
