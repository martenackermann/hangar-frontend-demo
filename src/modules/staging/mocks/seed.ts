import type { SeedDefinition } from '@/mocks/db'
import { effectiveDeliveryType, itemsOf } from '@/mocks/core/read-models'
import { shipTo } from './model'

/**
 * H3 table `shipments` (SPEC §5.4) in the demo database. Read from the backend export
 * (`fixture.tables.shipments`) when present; otherwise derived deterministically from the core
 * story: one shipment for every SR with a `ship` transition (the backend seeder does the same).
 * Label PDFs are rendered on demand by `GET /shipments/{id}/label`.
 */
export interface ShipmentRow {
  id: number
  serviceRequestId: number
  carrierShipmentId: string
  parcelCount: number
  trackingUrls: string[]
  returnTrackingUrls: string[]
  includeReturnLabel: boolean
  combinedParcel: boolean
  confirmationMailSent: boolean
  recipientName: string
  deliveryStreet: string
  deliveryZip: string
  deliveryCity: string
  deliveryCountry: string
  /** Stored label file (`stored_files.id`); `null` until first requested in the demo. */
  labelFileId: number | null
  createdBy: number
  createdAt: string
  updatedAt: string
}

declare module '@/mocks/db' {
  interface DemoCollections {
    shipments: ShipmentRow
  }
}

const TRACK = 'https://track.example.com'
const DANA_ID = 1

function compactDate(iso: string): string {
  return iso.slice(0, 10).replaceAll('-', '')
}

export const seed: SeedDefinition = {
  module: 'staging',
  version: 1,
  order: 30,
  run: ({ db, faker, fixture }) => {
    const shipments = db.collection('shipments')
    const exported = fixture.tables.shipments as ShipmentRow[] | undefined
    if (exported?.length) {
      // Backend rows (already date-shifted with the rest of the fixture by the loader).
      const existing = db.table<ShipmentRow>('shipments').all()
      if (existing.length === 0) shipments.insertMany(exported)
      return
    }
    const transitions = db
      .collection('status_transitions')
      .filter((t) => t.entityType === 'service_request' && t.action === 'ship')
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.entityId - b.entityId)
    let n = 0
    for (const transition of transitions) {
      const sr = db.collection('service_requests').get(transition.entityId)
      if (!sr || !effectiveDeliveryType(sr)?.startsWith('parcel')) continue
      n += 1
      const items = itemsOf(sr.id)
      const newCount = items.filter((i) => i.slot.startsWith('new_')).length
      const oldCount = items.length - newCount
      const combined = faker.number.float() < 0.25
      const parcels = combined ? 1 : Math.max(newCount, 1)
      const id = `PC${compactDate(transition.occurredAt)}${String(900_000 + n).padStart(6, '0')}`
      const parcelIds = Array.from({ length: parcels }, (_, i) => `${id}-${i + 1}`)
      const returnIds = Array.from({ length: oldCount }, (_, i) => `${id}-${parcels + i + 1}`)
      const target = shipTo(sr)
      const contact = db.collection('contacts').get(sr.contactId)
      shipments.insert({
        serviceRequestId: sr.id,
        carrierShipmentId: id,
        parcelCount: parcels,
        trackingUrls: parcelIds.map((p) => `${TRACK}/${p}`),
        returnTrackingUrls: returnIds.map((p) => `${TRACK}/return/${p}R`),
        includeReturnLabel: oldCount > 0,
        combinedParcel: combined,
        confirmationMailSent: Boolean(contact?.email),
        recipientName: target.recipientName,
        deliveryStreet: target.address.street ?? '',
        deliveryZip: target.address.zip ?? '',
        deliveryCity: target.address.city ?? '',
        deliveryCountry: target.address.country ?? 'Freeland',
        labelFileId: null,
        createdBy: transition.actorUserId ?? DANA_ID,
        createdAt: transition.occurredAt,
        updatedAt: transition.occurredAt,
      })
    }
  },
}
