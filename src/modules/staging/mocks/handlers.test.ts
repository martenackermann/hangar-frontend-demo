import { describe, expect, it } from 'vitest'
import { api } from '@/lib/api/client'
import { isApiError } from '@/lib/api/errors'
import type {
  AssetCandidates,
  AssetSummary,
  InstallationPlaceOccupancy,
  ParcelPickingItem,
  PersonalizationQueueItem,
  ScanResult,
  ServiceRequestDetail,
  ServiceRequestItem,
  Shipment,
  ShipmentCreated,
  SoftwareChecklist,
  TechnicianPicking,
} from '@/lib/api/types'
import { db } from '@/mocks/db'
import { PERSONA_EMAILS, signInAs } from '@/test/utils'
import { checklistOf, fifoCandidates } from './model'

/** H3 mock API: the same verdicts, guards and errors as the backend slice (API.md §6). */

async function failure(call: Promise<unknown>) {
  try {
    await call
  } catch (error) {
    if (isApiError(error)) return error
    throw error
  }
  throw new Error('expected the call to fail')
}

const RIV = () => db.collection('sites').find((s) => s.code === 'RIV')!.id
const goodsIn = (code = 'RIV-GOODS_IN') =>
  db.collection('stock_locations').find((l) => l.code === code)!.id

describe('installation place scan station', () => {
  it('places, reports verdicts and undoes', async () => {
    await signInAs(PERSONA_EMAILS.technician)
    const asset = db
      .collection('assets')
      .find((a) => a.status === 'available' && a.locationId === goodsIn())!
    const scan = (serial: string, place: string) =>
      api.post<ScanResult<AssetSummary>>('/scan/installation-place', {
        siteId: RIV(),
        serial,
        place,
      })

    expect((await scan(asset.serialNumber, 'XX')).code).toBe('invalid_place')
    expect((await scan('NOPE', 'B4-12')).verdict).toBe('error')
    const placed = await scan(asset.serialNumber.toLowerCase(), 'loc:y7-12')
    expect([placed.verdict, placed.code, placed.applied]).toEqual(['ok', 'placed', true])
    expect(placed.entity?.installationPlace).toBe('Y7-12')
    expect(placed.undo?.href).toBe('/scan/installation-place/undo')
    expect((await scan(asset.serialNumber, 'Y7-12')).code).toBe('unchanged')

    const undone = await api.post<ScanResult<AssetSummary>>(
      placed.undo!.href,
      placed.undo!.body ?? {},
    )
    expect(undone.code).toBe('undone')
    expect(db.collection('assets').get(asset.id)?.locationId).toBe(goodsIn())
    const stale = await failure(api.post(placed.undo!.href, placed.undo!.body ?? {}))
    expect([stale.status, stale.code]).toEqual([409, 'undo_not_possible'])
  })

  it('needs staging.scan (viewer 403) and lists occupied places', async () => {
    await signInAs(PERSONA_EMAILS.viewer)
    const denied = await failure(
      api.post('/scan/installation-place', { siteId: RIV(), serial: 'X', place: 'A1-01' }),
    )
    expect(denied.status).toBe(403)
    const places = await api.get<{ data: InstallationPlaceOccupancy[] }>(
      '/staging/installation-places',
      { query: { siteId: RIV() } },
    )
    expect(places.data.length).toBeGreaterThan(5)
    expect(places.data[0]!.assets.length).toBeGreaterThan(0)
  })
})

describe('personalization', () => {
  it('claims, assigns by scan (FIFO warning) and finishes', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const queue = await api.get<{ data: PersonalizationQueueItem[] }>('/personalization/queue', {
      query: { siteId: RIV(), status: 'appointment_booked', perPage: 200 },
    })
    const target = queue.data.find((row) =>
      row.stockHints.every((hint) => hint.availableCount >= 2),
    )!
    expect(target.availableActions).toContain('claim')
    await api.post(`/service-requests/${target.id}/actions/claim`, {})

    const notEditor = await failure(
      (async () => {
        await signInAs(PERSONA_EMAILS.admin)
        return api.post(`/service-requests/${target.id}/items/new_base/assignment`, {
          serial: 'X',
        })
      })(),
    )
    expect([notEditor.status, notEditor.guard?.code]).toEqual([409, 'is_editor'])
    await signInAs(PERSONA_EMAILS.dispatcher)

    const oldSlot = await failure(
      api.post(`/service-requests/${target.id}/items/old_base/assignment`, { serial: 'X' }),
    )
    expect([oldSlot.status, oldSlot.code]).toEqual([422, 'slot_not_assignable'])

    for (const [index, hint] of target.stockHints.entries()) {
      const candidates = await api.get<AssetCandidates>(
        `/service-requests/${target.id}/asset-candidates`,
        { query: { slot: hint.slot } },
      )
      expect(candidates.data[0]!.fifoRank).toBe(1)
      const pick = index === 0 ? candidates.data[1]! : candidates.data[0]!
      const result = await api.post<ScanResult<ServiceRequestItem>>(
        `/service-requests/${target.id}/items/${hint.slot}/assignment`,
        { serial: pick.asset.serialNumber },
      )
      expect(result.code).toBe(index === 0 ? 'not_fifo' : 'assigned')
      expect(result.applied).toBe(true)
      expect(result.entity?.asset?.id).toBe(pick.asset.id)
    }
    const wrong = await api.post<ScanResult<ServiceRequestItem>>(
      `/service-requests/${target.id}/items/new_base/assignment`,
      { serial: 'NOPE-404' },
    )
    expect([wrong.verdict, wrong.code]).toEqual(['error', 'unknown_serial'])

    const finished = await api.post<ServiceRequestDetail>(
      `/service-requests/${target.id}/actions/finish_personalization`,
      {},
    )
    expect(finished.status).toBe('personalization_done')
    expect(finished.editor).toBeNull()
  })

  it('saves the software checklist and closes the order', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const row = db
      .collection('service_requests')
      .find((sr) => sr.status === 'personalization_done' && !checklistOf(sr).complete)!
    const blocked = await failure(api.post(`/service-requests/${row.id}/actions/close_order`, {}))
    expect([blocked.status, blocked.guard?.code]).toEqual([409, 'software_checklist_complete'])
    const current = await api.get<SoftwareChecklist>(
      `/service-requests/${row.id}/software-checklist`,
    )
    const saved = await api.put<SoftwareChecklist>(
      `/service-requests/${row.id}/software-checklist`,
      { installedSoftware: current.required, addedSoftware: current.added },
    )
    expect(saved.complete).toBe(true)
    const closed = await api.post<ServiceRequestDetail>(
      `/service-requests/${row.id}/actions/close_order`,
      {},
    )
    expect(closed.status).toBe('ready_for_picking')
    expect(closed.items.find((i) => i.slot === 'new_base')?.asset?.status).toBe('prepared')
  })
})

describe('picking and shipping', () => {
  it('lists today’s technician picking with totals', async () => {
    await signInAs(PERSONA_EMAILS.viewer)
    const picking = await api.get<TechnicianPicking>('/picking/technician', {
      query: { siteId: RIV() },
    })
    expect(picking.site.code).toBe('RIV')
    const rows = picking.groups.flatMap((g) => g.serviceRequests)
    expect(picking.totals.picked + picking.totals.toPick).toBe(rows.length)
  })

  it('packs by scan and creates a shipment via the carrier', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const list = await api.get<{ data: ParcelPickingItem[] }>('/picking/parcel')
    const target = list.data.find((row) => !row.allPacked)!
    const generic = await failure(api.post(`/service-requests/${target.id}/actions/ship`, {}))
    expect([generic.status, generic.code]).toEqual([404, 'unknown_action'])
    const unpacked = await failure(api.post(`/service-requests/${target.id}/shipments`, {}))
    expect(unpacked.guard?.code).toBe('all_new_items_packed')

    for (const item of target.items.filter((i) => i.direction === 'deliver' && i.asset)) {
      const packed = await api.post<ScanResult<ServiceRequestItem>>('/scan/parcel', {
        serviceRequestId: target.id,
        serial: item.asset!.serialNumber,
      })
      expect(['packed', 'already_packed']).toContain(packed.code)
    }
    const created = await api.post<ShipmentCreated>(`/service-requests/${target.id}/shipments`, {
      includeReturnLabel: true,
      combinedParcel: false,
      sendConfirmation: true,
    })
    expect(created.serviceRequest.status).toBe('shipped')
    expect(created.shipment.carrierShipmentId).toMatch(/^PC\d{14}$/)
    expect(created.label.contentType).toBe('application/pdf')
    if (!target.hasOldItems) expect(created.warnings).toContain('no_return_items')

    const forSr = await api.get<{ data: Shipment[] }>(`/service-requests/${target.id}/shipments`)
    expect(forSr.data).toHaveLength(1)
    const all = await api.get<{ data: Shipment[]; meta: { total: number } }>('/shipments')
    expect(all.data[0]!.id).toBe(created.shipment.id)
  })
})

describe('mock model', () => {
  it('orders FIFO candidates by check-in date', () => {
    const asset = db
      .collection('assets')
      .find((a) => a.status === 'available' && a.installationPlace !== null && a.articleId !== null)!
    const site = db.collection('stock_locations').get(asset.locationId)!.siteId!
    const list = fifoCandidates(asset.articleId!, site)
    const dates = list.map((a) => a.checkedInAt ?? '9999')
    expect([...dates].sort()).toEqual(dates)
  })
})
