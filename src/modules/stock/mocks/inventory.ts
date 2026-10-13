import type {
  InventoryDetail,
  InventoryScan,
  InventorySummary,
  ReconciliationItem,
  ScanResult,
} from '@/lib/api/types'
import type { MockActor } from '@/mocks/auth'
import { db } from '@/mocks/db'
import type { AssetRow, StockLocationRow } from '@/mocks/fixtures/types'
import { assetSummary, locationRef, siteRef, userRef } from '@/mocks/core/read-models'
import { moveAsset } from '@/mocks/core/workflow'
import { csv, storeFile } from '@/mocks/files'
import {
  DEACTIVATED,
  docDateTime,
  EXPECTED_TYPES,
  label,
  locationMap,
  locationsOfSite,
} from './common'
import type {
  FrozenEntry,
  InventoryCounts,
  InventoryRow,
  InventoryScanRow,
  ReconciliationCategory,
} from './tables'

/** Inventories (SPEC §4.6, §6.9; SPEC_RESOLUTIONS #25, #27, #28) — port of `services/inventory.py`. */

const CATEGORY_ORDER: Record<ReconciliationCategory, number> = {
  missing: 0,
  wrong_location: 1,
  unknown: 2,
  matched: 3,
}
const RELOCATABLE = new Set(['available', 'collected', 'missing'])
const MISSABLE = new Set(['available', 'collected'])

// ---- expected set ----------------------------------------------------------------------------

export function expectedAssets(siteId: number): AssetRow[] {
  const locations = new Set(locationsOfSite(siteId).map((l) => l.id))
  return db
    .collection('assets')
    .filter((a) => locations.has(a.locationId) && !DEACTIVATED.has(a.status))
    .sort((a, b) => a.serialNumber.localeCompare(b.serialNumber))
}

export function scansOf(inventoryId: number): InventoryScanRow[] {
  return db.collection('inventory_scans').filter((s) => s.inventoryId === inventoryId)
}

export function liveCounts(inventory: InventoryRow): InventoryCounts {
  const expected = expectedAssets(inventory.siteId)
  const ids = new Set(expected.map((a) => a.id))
  const scans = scansOf(inventory.id)
  const scannedInE = new Set(
    scans.filter((s) => s.assetId && ids.has(s.assetId)).map((s) => s.assetId),
  )
  return {
    expected: expected.length,
    matched: scans.filter((s) => s.result === 'matched' && s.assetId && ids.has(s.assetId)).length,
    missing: Math.max(0, expected.length - scannedInE.size),
    wrongLocation: scans.filter((s) => s.result === 'wrong_location').length,
    unknown: scans.filter((s) => s.result === 'unknown').length,
    corrected: null,
  }
}

export function countsOf(inventory: InventoryRow): InventoryCounts {
  return inventory.status !== 'open' && inventory.resultSummary
    ? inventory.resultSummary
    : liveCounts(inventory)
}

// ---- read models -----------------------------------------------------------------------------

export function scanOut(scan: InventoryScanRow): InventoryScan {
  const asset = scan.assetId ? db.collection('assets').get(scan.assetId) : undefined
  return {
    id: scan.id,
    serialNumber: scan.serialNumber,
    result: scan.result,
    asset: asset ? assetSummary(asset) : null,
    scannedLocation: locationRef(scan.scannedLocationId),
    recordedLocation: locationRef(scan.recordedLocationId),
    scannedBy: userRef(scan.scannedBy)!,
    scannedAt: scan.scannedAt,
  }
}

export function inventorySummary(inventory: InventoryRow): InventorySummary {
  return {
    id: inventory.id,
    site: siteRef(inventory.siteId)!,
    status: inventory.status,
    openedAt: inventory.openedAt,
    openedBy: userRef(inventory.openedBy)!,
    closedAt: inventory.closedAt,
    closedBy: userRef(inventory.closedBy),
    countDate: inventory.countDate,
    summary: countsOf(inventory),
  }
}

export function inventoryDetail(inventory: InventoryRow, actor: MockActor | null): InventoryDetail {
  const summary = inventorySummary(inventory)
  const counts = summary.summary
  const scanned = counts.expected - counts.missing
  return {
    ...summary,
    note: inventory.note,
    applyCorrections: inventory.applyCorrections,
    version: inventory.version,
    progress: {
      scanned,
      expected: counts.expected,
      percent: counts.expected ? Math.round((scanned * 100) / counts.expected) : 0,
    },
    zones: locationsOfSite(inventory.siteId).map((l) => locationRef(l.id)!),
    recentScans: scansOf(inventory.id)
      .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt) || b.id - a.id)
      .slice(0, 20)
      .map(scanOut),
    availableActions:
      inventory.status === 'open' && actor?.permissions.includes('inventory.manage')
        ? ['close', 'cancel']
        : [],
  }
}

// ---- scan ---------------------------------------------------------------------------------------

function findAsset(value: string): AssetRow | undefined {
  const assets = db.collection('assets')
  return assets.find((a) => a.serialNumber === value) ?? assets.find((a) => a.assetTag === value)
}

function timeOf(iso: string): string {
  return docDateTime(iso).split(', ').pop() ?? ''
}

export function scan(
  inventory: InventoryRow,
  value: string,
  zone: StockLocationRow | null,
  actor: MockActor,
): ScanResult<InventoryScan> {
  const asset = findAsset(value)
  const serial = asset?.serialNumber ?? value
  const scans = scansOf(inventory.id)
  const progress = () => {
    const counts = liveCounts(inventory)
    return { done: counts.expected - counts.missing, total: counts.expected }
  }
  const previous = scans.find(
    (s) => s.serialNumber === serial || (asset?.id !== undefined && s.assetId === asset.id),
  )
  const base = {
    scannedValue: value,
    canRegister: false,
    suggestedSlots: [],
  }
  if (previous) {
    const who = userRef(previous.scannedBy)?.displayName ?? 'someone'
    return {
      ...base,
      verdict: 'warning',
      code: 'duplicate',
      message: `Already scanned ${timeOf(previous.scannedAt)} by ${who}.`,
      applied: false,
      entity: scanOut(previous),
      undo: null,
      progress: progress(),
    }
  }
  const locations = locationMap()
  const location = asset ? locations.get(asset.locationId) : undefined
  let result: InventoryScanRow['result']
  let verdict: ScanResult['verdict']
  let code: string
  let message: string
  if (!asset || !location) {
    result = 'unknown'
    verdict = 'warning'
    code = 'unknown_recorded'
    message = 'Unknown serial — recorded as unexpected.'
  } else if (location.siteId === inventory.siteId && !DEACTIVATED.has(asset.status)) {
    if (!zone || zone.id === asset.locationId) {
      result = 'matched'
      verdict = 'ok'
      code = 'matched'
      const article = asset.articleId ? db.collection('articles').get(asset.articleId) : undefined
      message = `${article?.name ?? asset.model ?? 'Unknown model'} · ${label('locationType', location.type)}${asset.installationPlace ? ` ${asset.installationPlace}` : ''}`
      if (asset.status === 'missing') message += ' — was marked missing; found again.'
    } else {
      result = 'wrong_location'
      verdict = 'warning'
      code = 'wrong_zone'
      message = `Recorded in ${label('locationType', location.type)}, scanned in ${label('locationType', zone.type)}.`
    }
  } else {
    result = 'wrong_location'
    verdict = 'warning'
    code = 'wrong_site'
    message =
      location.siteId === null
        ? `Recorded as ${label('assetStatus', asset.status)} (${location.name}).`
        : `Recorded at ${location.name}.`
  }
  const row = db.collection('inventory_scans').insert({
    inventoryId: inventory.id,
    serialNumber: serial,
    assetId: asset?.id ?? null,
    result,
    scannedLocationId: zone?.id ?? null,
    recordedLocationId: asset?.locationId ?? null,
    scannedBy: actor.id,
    scannedAt: new Date().toISOString(),
  })
  return {
    ...base,
    verdict,
    code,
    message,
    applied: true,
    entity: scanOut(row),
    undo: { method: 'DELETE', href: `/inventories/${inventory.id}/scans/${row.id}`, body: null },
    progress: progress(),
  }
}

// ---- reconciliation -------------------------------------------------------------------------------

export interface Entry {
  category: ReconciliationCategory
  serial: string
  asset: AssetRow | null
  status: string | null
  recordedLocationId: number | null
  scannedLocationId: number | null
  scannedById: number | null
  scannedAt: string | null
  correction: {
    action: 'mark_missing' | 'inventory_relocate'
    targetId: number | null
    place: string | null
  } | null
  corrected: boolean
}

function defaultTarget(status: string, siteId: number): number | null {
  const locations = locationsOfSite(siteId)
  const goodsIn = locations.find((l) => l.type === 'goods_in')
  if ((status === 'available' || status === 'missing') && goodsIn) return goodsIn.id
  return locations.find((l) => l.type === 'return')?.id ?? null
}

export function liveEntries(inventory: InventoryRow): Entry[] {
  const scans = scansOf(inventory.id)
  const expected = expectedAssets(inventory.siteId)
  const expectedIds = new Set(expected.map((a) => a.id))
  const scanned = new Set(scans.filter((s) => s.assetId).map((s) => s.assetId))
  const assets = db.collection('assets')
  const locations = locationMap()
  const entries: Entry[] = []
  for (const s of scans) {
    const asset = s.assetId ? (assets.get(s.assetId) ?? null) : null
    const common = {
      serial: s.serialNumber,
      asset,
      status: asset?.status ?? null,
      recordedLocationId: asset?.locationId ?? s.recordedLocationId,
      scannedLocationId: s.scannedLocationId,
      scannedById: s.scannedBy,
      scannedAt: s.scannedAt,
      corrected: false,
    }
    if (s.result === 'matched') {
      if (!asset || !expectedIds.has(asset.id)) continue
      const location = locations.get(asset.locationId)
      entries.push({
        ...common,
        category: 'matched',
        correction:
          asset.status === 'missing'
            ? {
                action: 'inventory_relocate',
                targetId: asset.locationId,
                place: location?.type === 'staging' ? asset.installationPlace : null,
              }
            : null,
      })
    } else if (s.result === 'wrong_location') {
      let correction: Entry['correction'] = null
      if (asset && RELOCATABLE.has(asset.status)) {
        const target = s.scannedLocationId ?? defaultTarget(asset.status, inventory.siteId)
        if (target !== null && !(target === asset.locationId && asset.status !== 'missing')) {
          correction = {
            action: 'inventory_relocate',
            targetId: target,
            place:
              target === asset.locationId && locations.get(target)?.type === 'staging'
                ? asset.installationPlace
                : null,
          }
        }
      }
      entries.push({ ...common, category: 'wrong_location', correction })
    } else {
      entries.push({ ...common, category: 'unknown', correction: null })
    }
  }
  for (const asset of expected) {
    if (scanned.has(asset.id)) continue
    entries.push({
      category: 'missing',
      serial: asset.serialNumber,
      asset,
      status: asset.status,
      recordedLocationId: asset.locationId,
      scannedLocationId: null,
      scannedById: null,
      scannedAt: null,
      correction: MISSABLE.has(asset.status)
        ? { action: 'mark_missing', targetId: null, place: null }
        : null,
      corrected: false,
    })
  }
  return entries.sort(
    (a, b) =>
      CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || a.serial.localeCompare(b.serial),
  )
}

export function frozen(entry: Entry): FrozenEntry {
  return {
    category: entry.category,
    serialNumber: entry.serial,
    assetId: entry.asset?.id ?? null,
    status: entry.status,
    recordedLocationId: entry.recordedLocationId,
    scannedLocationId: entry.scannedLocationId,
    scannedById: entry.scannedById,
    scannedAt: entry.scannedAt,
    correctable: entry.correction !== null,
    corrected: entry.corrected,
  }
}

function fromFrozen(raw: FrozenEntry): Entry {
  return {
    category: raw.category,
    serial: raw.serialNumber,
    asset: raw.assetId ? (db.collection('assets').get(raw.assetId) ?? null) : null,
    status: raw.status,
    recordedLocationId: raw.recordedLocationId,
    scannedLocationId: raw.scannedLocationId,
    scannedById: raw.scannedById,
    scannedAt: raw.scannedAt,
    correction: raw.correctable ? { action: 'mark_missing', targetId: null, place: null } : null,
    corrected: raw.corrected,
  }
}

export function entriesOf(inventory: InventoryRow): Entry[] {
  return inventory.status === 'open' || !inventory.reconciliation
    ? liveEntries(inventory)
    : inventory.reconciliation.map(fromFrozen)
}

export function reconciliationItem(entry: Entry): ReconciliationItem {
  return {
    serialNumber: entry.serial,
    asset: entry.asset ? assetSummary(entry.asset) : null,
    category: entry.category,
    recordedLocation: locationRef(entry.recordedLocationId),
    scannedLocation: locationRef(entry.scannedLocationId),
    scannedBy: userRef(entry.scannedById),
    scannedAt: entry.scannedAt,
    correctable: entry.correction !== null,
  }
}

// ---- close / cancel --------------------------------------------------------------------------------

const REPORT_HEADER = [
  'Serial',
  'Asset tag',
  'Article',
  'Status',
  'Recorded location',
  'Scanned location',
  'Scanned by',
  'Scanned at',
]

export function reportCsv(entries: Entry[], category: ReconciliationCategory): string {
  const locations = locationMap()
  const articles = new Map(
    db
      .collection('articles')
      .all()
      .map((a) => [a.id, a.name]),
  )
  return csv([
    REPORT_HEADER,
    ...entries
      .filter((e) => e.category === category)
      .map((e) => [
        e.serial,
        e.asset?.assetTag,
        e.asset ? (e.asset.articleId ? articles.get(e.asset.articleId) : e.asset.model) : null,
        e.status ? label('assetStatus', e.status) : null,
        e.recordedLocationId ? locations.get(e.recordedLocationId)?.name : null,
        e.scannedLocationId ? locations.get(e.scannedLocationId)?.name : null,
        userRef(e.scannedById)?.displayName,
        docDateTime(e.scannedAt),
      ]),
  ])
}

export function applyCorrections(
  inventory: InventoryRow,
  entries: Entry[],
  actor: MockActor,
): number {
  let corrected = 0
  const site = db.collection('sites').get(inventory.siteId)
  const ordered = [...entries].sort(
    (a, b) => (a.category === 'missing' ? 0 : 1) - (b.category === 'missing' ? 0 : 1),
  )
  const locations = locationMap()
  for (const entry of ordered) {
    const correction = entry.correction
    if (!correction || !entry.asset) continue
    const reason = `Inventory ${site?.name ?? ''} #${inventory.id}`
    if (correction.action === 'mark_missing') {
      moveAsset(entry.asset.id, 'mark_missing', {
        toStatus: 'missing',
        actor,
        trigger: 'user',
        reason,
        sourceRef: `inventory:${inventory.id}`,
      })
    } else if (correction.targetId !== null) {
      const target = locations.get(correction.targetId)
      moveAsset(entry.asset.id, 'inventory_relocate', {
        toStatus: target?.type === 'return' ? 'collected' : 'available',
        toLocationId: correction.targetId,
        installationPlace: correction.place,
        actor,
        trigger: 'user',
        reason,
        sourceRef: `inventory:${inventory.id}`,
      })
    }
    entry.corrected = true
    corrected++
  }
  return corrected
}

export function storeReports(inventory: InventoryRow, entries: Entry[], actorId: number | null) {
  const site = db.collection('sites').get(inventory.siteId)
  const ids: Record<'missing' | 'wrong_location' | 'unknown', number> = {
    missing: 0,
    wrong_location: 0,
    unknown: 0,
  }
  for (const kind of ['missing', 'wrong_location', 'unknown'] as const) {
    ids[kind] = storeFile({
      filename: `inventory-${inventory.id}-${(site?.code ?? '').toLowerCase()}-${kind.replace('_', '-')}.csv`,
      contentType: 'text/csv',
      body: reportCsv(entries, kind),
      purpose: 'inventory_report',
      entity: { type: 'inventory', id: inventory.id },
      actorId,
      ttlHours: null,
    }).id
  }
  return ids
}

export { EXPECTED_TYPES }
