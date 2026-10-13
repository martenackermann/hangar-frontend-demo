import type { Faker } from '@faker-js/faker'
import { addDays, addWorkingDays, isWorkingDay } from '@/lib/format'
import type { DemoDatabase, SeedDefinition } from '@/mocks/db'
import type { AssetMovementRow } from '@/mocks/fixtures/types'
import { csv, storeFile } from '@/mocks/files'
import { businessDateTime, compact, DEACTIVATED, EXPECTED_TYPES } from './common'
import { lineFromSetting } from './calloff'
import { frozen, liveEntries, storeReports, type Entry } from './inventory'
import { recalculateStock } from './stock'
import './tables'

/**
 * H5 demo tables (SPEC §11.7). When `seed.json` carries them (the backend exporter writes all
 * five tables) they are already loaded with the core tables and nothing happens here. Otherwise
 * a fallback mirrors the backend seeder from the core rows: inventories with the fixed ids
 * EAS 1 / RIV 2 (closed T−60 / T−30, missing devices = the core's `inventory:{id}` movements)
 * and HIL 3 (open since wd(−1) 09:00), 9 sent call-offs + an Eastgate draft, and the two
 * deactivation batches behind the core's `deactivation:{id}` movements.
 */
const DANA = 'dana.dispatcher@example.com'
const THEO = 'theo.technician@example.com'
const TARA = 'tara.lindqvist@example.com'
const OMAR = 'omar.reyes@example.com'
const BASE32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function fakeSerial(faker: Faker, prefix = 'KD'): string {
  return `${prefix}X${Array.from({ length: 7 }, () => faker.helpers.arrayElement([...BASE32])).join('')}`
}

function userId(db: DemoDatabase, email: string): number {
  const user = db.collection('users').find((u) => u.email === email)
  if (!user) throw new Error(`seed: user ${email} missing`)
  return user.id
}

/** Location/status of every asset at time `at`, replayed from the movement ledger. */
function stateAt(movements: readonly AssetMovementRow[], at: string) {
  const latest = new Map<number, AssetMovementRow>()
  for (const m of movements) {
    if (m.occurredAt > at) continue
    const current = latest.get(m.assetId)
    if (
      !current ||
      m.occurredAt > current.occurredAt ||
      (m.occurredAt === current.occurredAt && m.id > current.id)
    )
      latest.set(m.assetId, m)
  }
  return latest
}

function seedInventories(db: DemoDatabase, faker: Faker, today: string, d0: string): void {
  const dana = userId(db, DANA)
  const movements = db.collection('asset_movements').all()
  const sites = db.collection('sites')
  const locations = db.collection('stock_locations').all()
  for (const [code, daysAgo, scannerEmail, expectedId] of [
    ['EAS', 60, OMAR, 1],
    ['RIV', 30, THEO, 2],
  ] as const) {
    const site = sites.find((s) => s.code === code)
    if (!site) continue
    const scanner = userId(db, scannerEmail)
    const countDay = addDays(today, -daysAgo)
    const openedAt = businessDateTime(addDays(countDay, -2), 8)
    const closedAt = businessDateTime(countDay, 16)
    const siteLocations = new Set(
      locations.filter((l) => l.siteId === site.id && EXPECTED_TYPES.has(l.type)).map((l) => l.id),
    )
    const missingIds = new Set(
      movements
        .filter((m) => m.sourceRef === `inventory:${expectedId}` && m.action === 'mark_missing')
        .map((m) => m.assetId),
    )
    const state = stateAt(movements, openedAt)
    const expected = [...state.values()]
      .filter((m) => siteLocations.has(m.toLocationId) && !DEACTIVATED.has(m.toStatus))
      .map((m) => ({ asset: db.collection('assets').get(m.assetId), movement: m }))
      .filter((e) => e.asset !== undefined)
      .sort((a, b) => a.asset!.serialNumber.localeCompare(b.asset!.serialNumber))
    const inventory = db.collection('inventories').insert({
      id: expectedId,
      siteId: site.id,
      status: 'open',
      openedAt,
      openedBy: dana,
      closedAt: null,
      closedBy: null,
      countDate: null,
      applyCorrections: null,
      resultSummary: null,
      reconciliation: null,
      missingReportFileId: null,
      wrongLocationReportFileId: null,
      unknownReportFileId: null,
      note: `Quarterly stock-take ${site.name}`,
      version: 1,
      createdAt: openedAt,
    })
    const span = Date.parse(closedAt) - 3_600_000 - Date.parse(openedAt)
    const times = Array.from({ length: expected.length + 1 }, () =>
      new Date(Date.parse(openedAt) + faker.number.int({ min: 0, max: span })).toISOString(),
    ).sort()
    const entries: Entry[] = []
    let t = 0
    for (const { asset, movement } of expected) {
      if (missingIds.has(asset!.id)) {
        entries.push({
          category: 'missing',
          serial: asset!.serialNumber,
          asset: asset!,
          status: movement.toStatus,
          recordedLocationId: movement.toLocationId,
          scannedLocationId: null,
          scannedById: null,
          scannedAt: null,
          correction: { action: 'mark_missing', targetId: null, place: null },
          corrected: true,
        })
        continue
      }
      const at = times[t++] ?? openedAt
      db.collection('inventory_scans').insert({
        inventoryId: inventory.id,
        serialNumber: asset!.serialNumber,
        assetId: asset!.id,
        result: 'matched',
        scannedLocationId: null,
        recordedLocationId: movement.toLocationId,
        scannedBy: scanner,
        scannedAt: at,
      })
      entries.push({
        category: 'matched',
        serial: asset!.serialNumber,
        asset: asset!,
        status: movement.toStatus,
        recordedLocationId: movement.toLocationId,
        scannedLocationId: null,
        scannedById: scanner,
        scannedAt: at,
        correction: null,
        corrected: false,
      })
    }
    const unknown = fakeSerial(faker)
    const at = times[t] ?? openedAt
    db.collection('inventory_scans').insert({
      inventoryId: inventory.id,
      serialNumber: unknown,
      assetId: null,
      result: 'unknown',
      scannedLocationId: null,
      recordedLocationId: null,
      scannedBy: scanner,
      scannedAt: at,
    })
    entries.push({
      category: 'unknown',
      serial: unknown,
      asset: null,
      status: null,
      recordedLocationId: null,
      scannedLocationId: null,
      scannedById: scanner,
      scannedAt: at,
      correction: null,
      corrected: false,
    })
    const order = { missing: 0, wrong_location: 1, unknown: 2, matched: 3 }
    entries.sort(
      (a, b) => order[a.category] - order[b.category] || a.serial.localeCompare(b.serial),
    )
    const files = storeReports(inventory, entries, dana)
    const missing = entries.filter((e) => e.category === 'missing').length
    db.collection('inventories').update(inventory.id, {
      status: 'closed',
      closedAt,
      closedBy: dana,
      countDate: countDay,
      applyCorrections: true,
      resultSummary: {
        expected: expected.length,
        matched: entries.filter((e) => e.category === 'matched').length,
        missing,
        wrongLocation: 0,
        unknown: 1,
        corrected: missing,
      },
      reconciliation: entries.map(frozen),
      missingReportFileId: files.missing,
      wrongLocationReportFileId: files.wrong_location,
      unknownReportFileId: files.unknown,
      version: 2,
    })
  }

  // Hillford: open since wd(−1) 09:00, ~60 % counted by Tara, 3 wrong location, 2 unknown
  const hil = sites.find((s) => s.code === 'HIL')
  if (!hil) return
  const tara = userId(db, TARA)
  const openedAt = businessDateTime(addWorkingDays(d0, -1), 9)
  const inventory = db.collection('inventories').insert({
    id: 3,
    siteId: hil.id,
    status: 'open',
    openedAt,
    openedBy: dana,
    closedAt: null,
    closedBy: null,
    countDate: null,
    applyCorrections: null,
    resultSummary: null,
    reconciliation: null,
    missingReportFileId: null,
    wrongLocationReportFileId: null,
    unknownReportFileId: null,
    note: 'Stock-take before the next call-off',
    version: 1,
    createdAt: openedAt,
  })
  const expected = liveEntries(inventory)
    .map((e) => e.asset)
    .filter((a) => a !== null)
  const scanned = expected.filter(() => faker.number.float({ min: 0, max: 1 }) < 0.6)
  const staging = locations.find((l) => l.siteId === hil.id && l.type === 'staging')
  const otherSites = new Set(
    sites.filter((s) => s.code === 'EAS' || s.code === 'RIV').map((s) => s.id),
  )
  const elsewhere = db.collection('assets').filter((a) => {
    const location = locations.find((l) => l.id === a.locationId)
    return (
      a.status === 'available' &&
      location?.type === 'staging' &&
      otherSites.has(location.siteId ?? 0)
    )
  })
  const wrong = elsewhere.length >= 3 ? faker.helpers.arrayElements(elsewhere, 3) : []
  const end = Date.now() - 10 * 60_000
  const start = Date.parse(openedAt) + 20 * 60_000
  const total = scanned.length + wrong.length + 2
  const times = Array.from({ length: total }, () =>
    new Date(
      Math.min(end, start + faker.number.int({ min: 0, max: Math.max(60_000, end - start) })),
    ).toISOString(),
  ).sort()
  let i = 0
  for (const asset of scanned) {
    db.collection('inventory_scans').insert({
      inventoryId: inventory.id,
      serialNumber: asset.serialNumber,
      assetId: asset.id,
      result: 'matched',
      scannedLocationId: null,
      recordedLocationId: asset.locationId,
      scannedBy: tara,
      scannedAt: times[i++] ?? openedAt,
    })
  }
  for (const asset of wrong) {
    db.collection('inventory_scans').insert({
      inventoryId: inventory.id,
      serialNumber: asset.serialNumber,
      assetId: asset.id,
      result: 'wrong_location',
      scannedLocationId: staging?.id ?? null,
      recordedLocationId: asset.locationId,
      scannedBy: tara,
      scannedAt: times[i++] ?? openedAt,
    })
  }
  for (const prefix of ['LM', 'AP']) {
    db.collection('inventory_scans').insert({
      inventoryId: inventory.id,
      serialNumber: fakeSerial(faker, prefix),
      assetId: null,
      result: 'unknown',
      scannedLocationId: null,
      recordedLocationId: null,
      scannedBy: tara,
      scannedAt: times[i++] ?? openedAt,
    })
  }
}

const ORDER_CATEGORIES = new Set(['laptop', 'docking_station', 'monitor', 'headset'])

function seedCallOffs(db: DemoDatabase, faker: Faker, today: string): void {
  const dana = userId(db, DANA)
  const hubs = db
    .collection('sites')
    .filter((s) => s.kind === 'hub')
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const articles = new Map(
    db
      .collection('articles')
      .all()
      .map((a) => [a.id, a]),
  )
  const latest = new Map<number, { day: string; quantity: number }>()
  for (const days of [28, 14, 7]) {
    for (const hub of hubs) {
      let day = addDays(today, -days)
      while (!isWorkingDay(day)) day = addDays(day, -1)
      const sentAt = businessDateTime(day, 10, 15)
      const settings = db.collection('article_site_settings').filter((s) => {
        const a = articles.get(s.articleId)
        return s.siteId === hub.id && a?.isActive === true && ORDER_CATEGORIES.has(a.category)
      })
      const chosen = faker.helpers
        .arrayElements(settings, faker.number.int({ min: 3, max: 6 }))
        .sort((a, b) =>
          (articles.get(a.articleId)?.number ?? '').localeCompare(
            articles.get(b.articleId)?.number ?? '',
          ),
        )
      const order = db.collection('calloff_orders').insert({
        number: `CO-${hub.code}-${compact(day)}-01`,
        siteId: hub.id,
        status: 'sent',
        deliveryDate: addWorkingDays(day, 3),
        note: null,
        recipientEmail: 'partner-orders@example.com',
        createdBy: dana,
        sentAt,
        sentBy: dana,
        xlsxFileId: null,
        pdfFileId: null,
        version: 2,
        createdAt: new Date(Date.parse(sentAt) - 25 * 60_000).toISOString(),
      })
      for (const setting of chosen) {
        const demand = faker.number.int({ min: 2, max: 14 })
        const stock = faker.number.int({ min: 0, max: 10 })
        const suggested = Math.max(0, demand + setting.bufferQty - stock)
        const quantity = Math.max(1, suggested + faker.helpers.arrayElement([0, 0, 0, 2, -1]))
        db.collection('calloff_order_lines').insert({
          calloffOrderId: order.id,
          articleId: setting.articleId,
          demandQty: demand,
          stockQty: stock,
          bufferQty: setting.bufferQty,
          suggestedQty: suggested,
          quantity,
        })
        latest.set(setting.id, { day, quantity })
      }
    }
  }
  for (const [settingId, { day, quantity }] of latest) {
    db.collection('article_site_settings').update(settingId, {
      lastOrderDate: day,
      lastOrderedQty: quantity,
    })
  }
  const eastgate = hubs.find((h) => h.code === 'EAS')
  if (!eastgate) return
  const draft = db.collection('calloff_orders').insert({
    number: `CO-EAS-${compact(today)}-01`,
    siteId: eastgate.id,
    status: 'draft',
    deliveryDate: addWorkingDays(today, 3),
    note: 'Monitor 34 Ultrawide and Thunderbolt docks are short — please prioritise.',
    recipientEmail: 'partner-orders@example.com',
    createdBy: dana,
    sentAt: null,
    sentBy: null,
    xlsxFileId: null,
    pdfFileId: null,
    version: 1,
    createdAt: new Date(Date.now() - 40 * 60_000).toISOString(),
  })
  for (const setting of db
    .collection('article_site_settings')
    .filter((s) => s.siteId === eastgate.id)) {
    if (!articles.get(setting.articleId)?.isActive) continue
    const line = lineFromSetting(draft.id, setting)
    if (line.suggestedQty > 0) db.collection('calloff_order_lines').insert(line)
  }
}

function seedDeactivations(db: DemoDatabase, faker: Faker): void {
  const dana = userId(db, DANA)
  const locations = new Map(
    db
      .collection('stock_locations')
      .all()
      .map((l) => [l.id, l]),
  )
  for (const [batchNo, reason, extra] of [
    [1, 'returned_to_lessor', 2],
    [2, 'bought_out', 0],
  ] as const) {
    const moves = db
      .collection('asset_movements')
      .filter((m) => m.sourceRef === `deactivation:${batchNo}` && m.action === 'deactivate')
      .sort((a, b) => a.id - b.id)
    if (moves.length === 0) continue
    const at = new Date(
      Math.min(...moves.map((m) => Date.parse(m.occurredAt))) - 60_000,
    ).toISOString()
    const assets = moves
      .map((m) => db.collection('assets').get(m.assetId))
      .filter((a) => a !== undefined)
    const fake = Array.from({ length: extra }, () => fakeSerial(faker, 'QA'))
    const filename =
      batchNo === 1 ? `lessor-return-${at.slice(0, 10)}.csv` : `buyout-${at.slice(0, 10)}.csv`
    const upload = storeFile({
      filename,
      contentType: 'text/csv',
      body: csv([
        ['serial_number', 'asset_tag'],
        ...assets.map((a) => [a.serialNumber, a.assetTag ?? '']),
        ...fake.map((s) => [s, '']),
      ]),
      purpose: 'deactivation_upload',
      actorId: dana,
      ttlHours: null,
    })
    const tags = new Set(assets.map((a) => a.assetTag).filter(Boolean))
    const closedLeases = db
      .collection('lease_returns')
      .count(
        (l) =>
          tags.has(l.assetTag) && l.status === 'closed' && l.closeReason === 'device_deactivated',
      )
    const reasonText = reason === 'returned_to_lessor' ? 'Returned to lessor' : 'Bought out'
    const sample = [
      ...moves.map((m) => ({
        serialNumber: db.collection('assets').get(m.assetId)?.serialNumber ?? '',
        outcome: 'deactivated' as const,
        detail: `${reasonText} · was Return pending at ${locations.get(m.fromLocationId ?? 0)?.name ?? 'a hub'}`,
      })),
      ...fake.map((serialNumber) => ({
        serialNumber,
        outcome: 'not_found' as const,
        detail: 'Not in the asset records.',
      })),
    ].slice(0, 50)
    const notFound = fake.length
      ? storeFile({
          filename: `deactivation-${batchNo}-not-found.csv`,
          contentType: 'text/csv',
          body: csv([['serial_number'], ...fake.map((s) => [s])]),
          purpose: 'deactivation_report',
          actorId: dana,
          ttlHours: null,
        })
      : null
    db.collection('deactivation_batches').insert({
      id: batchNo,
      reason,
      originalFilename: filename,
      fileId: upload.id,
      totalRows: assets.length + fake.length,
      deactivatedCount: assets.length,
      alreadyDeactivatedCount: 0,
      rejectedCount: 0,
      notFoundCount: fake.length,
      closedLeaseReturnCount: closedLeases,
      notFoundFileId: notFound?.id ?? null,
      rejectedFileId: null,
      sample,
      createdBy: dana,
      createdAt: at,
    })
  }
}

export const seed: SeedDefinition = {
  module: 'stock',
  version: 1,
  order: 50,
  run: ({ db, faker, today }) => {
    if (db.collection('inventories').count() > 0) return // exported by the backend
    const d0 = isWorkingDay(today) ? today : addWorkingDays(today, 1)
    seedInventories(db, faker, today, d0)
    seedCallOffs(db, faker, today)
    seedDeactivations(db, faker)
    recalculateStock()
  },
}
