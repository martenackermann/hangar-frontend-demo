import type {
  Address,
  AssetSummary,
  ItemSlot,
  ScanResult,
  ScanVerdict,
  ServiceRequestItem,
  Shipment,
  SoftwareChecklist,
  UndoLink,
} from '@/lib/api/types'
import { daysBetween, toBusinessDate } from '@/lib/format'
import { servedEnums } from '@/mocks/core/fixture'
import {
  articleRef,
  assetSummary,
  effectiveDeliveryType,
  itemsOf,
  srItem,
  userRef,
} from '@/mocks/core/read-models'
import type { AssetRow, ServiceRequestRow } from '@/mocks/core/tables'
import { db } from '@/mocks/db'
import type { ShipmentRow } from './seed'

/**
 * Shared rules of the H3 mock API — the MSW twin of `app/modules/h3_staging/services`
 * (SPEC §6.6, §6.15–6.17; SPEC_RESOLUTIONS #25, #35).
 */

export const NEW_SLOTS: readonly ItemSlot[] = ['new_base', 'new_peripheral_1', 'new_peripheral_2']
export const PLACE_PATTERN = /^[A-Z]{1,2}[0-9]{1,2}-[0-9]{1,3}$/
const DEFAULT_COUNTRY = 'Freeland'

const SLOT_LABELS: Record<ItemSlot, string> = {
  new_base: 'New base device',
  new_peripheral_1: 'New peripheral 1',
  new_peripheral_2: 'New peripheral 2',
  old_base: 'Old base device',
  old_peripheral_1: 'Old peripheral 1',
  old_peripheral_2: 'Old peripheral 2',
}

export function slotLabel(slot: ItemSlot): string {
  return SLOT_LABELS[slot]
}

/** The verdict of a scan code comes from the one core table (SPEC_RESOLUTIONS #25). */
export function verdictOf(code: string): ScanVerdict {
  const fromServer = servedEnums().scanCode.find((value) => value.value === code)?.verdict
  return (fromServer as ScanVerdict | undefined) ?? 'error'
}

export function scanResult<T>(
  code: string,
  message: string,
  scannedValue: string,
  extra: {
    applied?: boolean
    entity?: T | null
    undo?: UndoLink | null
    progress?: { done: number; total: number } | null
  } = {},
): ScanResult<T> {
  return {
    verdict: verdictOf(code),
    code,
    message,
    scannedValue,
    applied: extra.applied ?? false,
    entity: extra.entity ?? null,
    undo: extra.undo ?? null,
    progress: extra.progress ?? null,
    canRegister: false,
    suggestedSlots: [],
  }
}

export function normalizeSerial(value: string): string {
  return value.trim().toUpperCase()
}

/** `LOC:` prefix stripped, upper-cased; `null` when not a valid place. */
export function normalizePlace(value: string): string | null {
  let cleaned = value.trim().toUpperCase()
  if (cleaned.startsWith('LOC:')) cleaned = cleaned.slice(4).trim()
  return PLACE_PATTERN.test(cleaned) ? cleaned : null
}

/** Asset by serial, falling back to the asset tag. */
export function findAsset(value: string): AssetRow | undefined {
  const normalized = normalizeSerial(value)
  if (!normalized) return undefined
  const assets = db.collection('assets')
  return (
    assets.find((a) => a.serialNumber === normalized) ??
    assets.find((a) => a.assetTag === normalized)
  )
}

export function device(asset: AssetRow): string {
  return asset.assetTag ?? asset.serialNumber
}

export function articleName(asset: AssetRow): string {
  const article = asset.articleId ? db.collection('articles').get(asset.articleId) : undefined
  return article?.name ?? asset.model ?? 'Unknown model'
}

export function locationRow(id: number) {
  return db.collection('stock_locations').get(id)
}

export function stagingOf(siteId: number) {
  return db.collection('stock_locations').find((l) => l.siteId === siteId && l.type === 'staging')
}

export function newItemsOf(srId: number) {
  return itemsOf(srId).filter((item) => item.slot.startsWith('new_'))
}

export function oldItemsOf(srId: number) {
  return itemsOf(srId).filter((item) => item.slot.startsWith('old_'))
}

export function itemDtos(srId: number): ServiceRequestItem[] {
  return itemsOf(srId).map(srItem)
}

// ---- FIFO (SPEC §6.6) ------------------------------------------------------------------------

/** Available, unlinked, placed assets of `articleId` in the staging location of `siteId`. */
export function fifoCandidates(articleId: number, siteId: number): AssetRow[] {
  const staging = stagingOf(siteId)
  if (!staging) return []
  return db
    .collection('assets')
    .filter(
      (a) =>
        a.status === 'available' &&
        a.serviceRequestId === null &&
        a.installationPlace !== null &&
        a.locationId === staging.id &&
        a.articleId === articleId,
    )
    .sort(
      (a, b) =>
        (a.checkedInAt ?? '9999').localeCompare(b.checkedInAt ?? '9999') ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id - b.id,
    )
}

export function ageDays(checkedInAt: string | null, today: string): number | null {
  return checkedInAt ? daysBetween(toBusinessDate(checkedInAt), today) : null
}

// ---- software checklist (SPEC §6.15) ------------------------------------------------------------

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const cleaned = value.trim()
    const key = cleaned.toLowerCase()
    if (cleaned && !seen.has(key)) {
      seen.add(key)
      result.push(cleaned)
    }
  }
  return result
}

export function checklist(
  requested: readonly string[],
  added: readonly string[],
  installed: readonly string[],
): SoftwareChecklist {
  const addedList = dedupe(added)
  const required = dedupe([...requested, ...addedList])
  const installedList = dedupe(installed)
  const keys = new Set(installedList.map((v) => v.toLowerCase()))
  const missing = required.filter((r) => !keys.has(r.toLowerCase()))
  return {
    required,
    installed: installedList,
    added: addedList,
    missing,
    complete: missing.length === 0,
  }
}

export function checklistOf(sr: ServiceRequestRow): SoftwareChecklist {
  return checklist(sr.requestedSoftware, sr.addedSoftware, sr.installedSoftware)
}

export function dedupeSoftware(values: readonly string[]): string[] {
  return dedupe(values)
}

// ---- ship-to (SPEC §6.17) -------------------------------------------------------------------------

export interface ShipTo {
  kind: 'user' | 'pickup_point'
  recipientName: string
  name2: string | null
  address: Address
}

function contactName(sr: ServiceRequestRow): string {
  const contact = db.collection('contacts').get(sr.contactId)
  if (!contact) return sr.number
  return contact.firstName ? `${contact.firstName} ${contact.lastName}` : contact.lastName
}

export function shipTo(sr: ServiceRequestRow): ShipTo {
  const site = sr.supplyingSiteId ? db.collection('sites').get(sr.supplyingSiteId) : undefined
  const country = sr.deliveryCountry ?? site?.country ?? DEFAULT_COUNTRY
  const region = sr.regionId ? db.collection('regions').get(sr.regionId) : undefined
  const name = contactName(sr)
  if (effectiveDeliveryType(sr) === 'parcel_to_pickup_point' && region) {
    return {
      kind: 'pickup_point',
      recipientName: region.pickupPointName ?? `${region.name} pickup point`,
      name2: `Attn: ${name}`,
      address: {
        street: region.pickupPointStreet,
        zip: region.pickupPointZip,
        city: region.pickupPointCity,
        country,
      },
    }
  }
  const contact = db.collection('contacts').get(sr.contactId)
  const line2 = [
    sr.deliveryRoom ? `Room ${sr.deliveryRoom}` : null,
    sr.deliveryBuilding ? `Building ${sr.deliveryBuilding}` : null,
  ]
    .filter(Boolean)
    .join(', ')
  return {
    kind: 'user',
    recipientName: name,
    name2: line2 || null,
    address: {
      street: sr.deliveryStreet ?? contact?.street ?? null,
      zip: sr.deliveryZip ?? contact?.zip ?? null,
      city: sr.deliveryCity ?? contact?.city ?? null,
      country,
    },
  }
}

// ---- shipments ---------------------------------------------------------------------------------

export function shipmentDto(row: ShipmentRow): Shipment {
  const sr = db.collection('service_requests').get(row.serviceRequestId)
  return {
    id: row.id,
    serviceRequest: { id: row.serviceRequestId, number: sr?.number ?? '?' },
    carrierShipmentId: row.carrierShipmentId,
    parcelCount: row.parcelCount,
    trackingUrls: row.trackingUrls,
    returnTrackingUrls: row.returnTrackingUrls,
    includeReturnLabel: row.includeReturnLabel,
    combinedParcel: row.combinedParcel,
    confirmationMailSent: row.confirmationMailSent,
    recipientName: row.recipientName,
    deliveryAddress: {
      street: row.deliveryStreet,
      zip: row.deliveryZip,
      city: row.deliveryCity,
      country: row.deliveryCountry,
    },
    createdBy: userRef(row.createdBy) ?? {
      id: row.createdBy,
      displayName: 'Unknown',
      email: '',
      role: 'dispatcher',
    },
    createdAt: row.createdAt,
  }
}

export function stockHint(articleId: number | null, siteId: number | null) {
  if (articleId === null || siteId === null) return { count: 0, first: undefined }
  const candidates = fifoCandidates(articleId, siteId)
  return { count: candidates.length, first: candidates[0] }
}

export function summaryOf(asset: AssetRow | undefined): AssetSummary | null {
  return asset ? assetSummary(asset) : null
}

export { articleRef }
