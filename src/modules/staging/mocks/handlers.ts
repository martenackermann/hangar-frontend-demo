import { http, HttpResponse, type RequestHandler } from 'msw'
import type {
  AssetCandidates,
  DeliveryType,
  ItemSlot,
  OrderClosingQueueItem,
  ParcelPickingItem,
  PersonalizationQueueItem,
  ProcurementType,
  ServiceRequestStatus,
  ShipmentCreated,
  TechnicianPicking,
} from '@/lib/api/types'
import { businessToday, toBusinessDate } from '@/lib/format'
import { authed, type MockActor } from '@/mocks/auth'
import { notify } from '@/mocks/core/notify'
import { moveAsset } from '@/mocks/core/workflow'
import {
  articleRef,
  assetSummary,
  effectiveDeliveryType,
  siteRef,
  srDetail,
  srItem,
  srListItem,
} from '@/mocks/core/read-models'
import type { ServiceRequestRow } from '@/mocks/core/tables'
import { db } from '@/mocks/db'
import { downloadLink, simplePdf, storeFile } from '@/mocks/files'
import { apiPath, intParam, listOf, problem, problems, readJson } from '@/mocks/http'
import { boolValue, multiValue, paginate, parsePage, queryRows } from '@/mocks/list'
import { applyAction, evaluateActions } from '@/mocks/workflow'
import {
  ageDays,
  articleName,
  checklist,
  checklistOf,
  dedupeSoftware,
  device,
  fifoCandidates,
  findAsset,
  itemDtos,
  locationRow,
  NEW_SLOTS,
  newItemsOf,
  normalizePlace,
  normalizeSerial,
  oldItemsOf,
  scanResult,
  shipmentDto,
  shipTo,
  slotLabel,
  stagingOf,
  stockHint,
  summaryOf,
} from './model'
import type { ShipmentRow } from './seed'

/**
 * Mock endpoints of H3 Staging & Fulfilment (API.md §6), mirroring the backend slice
 * (`app/modules/h3_staging`): same shapes, verdicts, guards, permissions and error codes.
 */

const SLOTS: readonly ItemSlot[] = [
  'new_base',
  'new_peripheral_1',
  'new_peripheral_2',
  'old_base',
  'old_peripheral_1',
  'old_peripheral_2',
]
const QUEUE_STATUSES: readonly ServiceRequestStatus[] = [
  'appointment_booked',
  'personalization_in_progress',
]
const PARCEL: readonly DeliveryType[] = ['parcel_to_user', 'parcel_to_pickup_point']
const TRACK = 'https://track.example.com'
const EDITOR_MESSAGE = 'Only the current editor can do this. Claim the request first.'

// ---- small helpers ---------------------------------------------------------------------------

function sr(id: number | undefined): ServiceRequestRow | undefined {
  return id === undefined ? undefined : db.collection('service_requests').get(id)
}

function hub(siteId: number | undefined, request: Request): Response | null {
  if (siteId === undefined)
    return problems.validation({ siteId: ['Field required'] }, undefined, request)
  const site = db.collection('sites').get(siteId)
  if (!site) return problems.notFound('Site', siteId, request)
  if (site.kind !== 'hub')
    return problems.validation({ siteId: ['Choose a hub site.'] }, 'Choose a hub site.', request)
  return null
}

function slotParam(value: unknown, request: Request): ItemSlot | Response {
  const slot = String(value) as ItemSlot
  if (!SLOTS.includes(slot))
    return problems.validation({ slot: [`Unknown slot '${String(value)}'.`] }, undefined, request)
  if (!NEW_SLOTS.includes(slot)) {
    // `slot_not_assignable` (SPEC_RESOLUTIONS #35)
    return problem(422, 'slot_not_assignable', 'Slot not assignable', {
      detail: `Slot '${slot}' collects an old device; only new slots can be assigned or packed.`,
      errors: { slot: ['Only new_* slots can be assigned or packed.'] },
      request,
    })
  }
  return slot
}

function itemFor(row: ServiceRequestRow, slot: ItemSlot, request: Request) {
  const item = newItemsOf(row.id).find((i) => i.slot === slot)
  return item ?? problems.notFound(`${row.number} item`, slot, request)
}

function isEditorProblem(row: ServiceRequestRow, actor: MockActor, request: Request) {
  if (row.status === 'personalization_in_progress' && row.editorUserId !== actor.id) {
    return problem(409, 'guard_failed', 'Precondition failed', {
      detail: EDITOR_MESSAGE,
      guard: { code: 'is_editor', message: EDITOR_MESSAGE },
      request,
    })
  }
  return null
}

function assignableProblem(row: ServiceRequestRow, actor: MockActor, request: Request) {
  if (row.status !== 'personalization_in_progress') {
    return problem(409, 'transition_not_allowed', 'Action not allowed', {
      detail: `Devices can only be assigned while the request is being personalized (status '${row.status}').`,
      allowedActions: evaluateActions('serviceRequest', row, actor).availableActions,
      request,
    })
  }
  return isEditorProblem(row, actor, request)
}

function srSearch(row: ServiceRequestRow, q: string): boolean {
  const needle = q.toLowerCase()
  const contact = db.collection('contacts').get(row.contactId)
  return [
    row.number,
    row.taskNumber,
    contact?.firstName,
    contact?.lastName,
    contact ? `${contact.firstName ?? ''} ${contact.lastName}` : null,
    contact?.email,
    contact?.userId,
  ].some((value) => value?.toLowerCase().includes(needle))
}

function appointmentDay(row: ServiceRequestRow): string | null {
  return row.appointmentStartAt ? toBusinessDate(row.appointmentStartAt) : null
}

function inRange(row: ServiceRequestRow, from: string | null, to: string | null): boolean {
  const day = appointmentDay(row)
  if (from && (!day || day < from)) return false
  return !(to && (!day || day > to))
}

function regionFilter(row: ServiceRequestRow, values: string[]): boolean {
  return values.some((v) => (v === 'none' ? row.regionId === null : Number(v) === row.regionId))
}

function bump(row: ServiceRequestRow, patch: Partial<ServiceRequestRow>): ServiceRequestRow {
  return db.collection('service_requests').update(row.id, { ...patch, version: row.version + 1 })!
}

function extraFields(
  body: Record<string, unknown>,
  allowed: readonly string[],
  request: Request,
): Response | null {
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k))
  if (!unknown.length) return null
  return problems.validation(
    Object.fromEntries(unknown.map((k) => [k, ['Extra inputs are not permitted']])),
    undefined,
    request,
  )
}

function json(value: unknown, status = 200) {
  return HttpResponse.json(value as Record<string, unknown>, { status })
}

// ---- installation place scan station (§6.1) ---------------------------------------------------

const installationPlaceHandlers: RequestHandler[] = [
  http.post(
    apiPath('/scan/installation-place'),
    authed('staging.scan', async ({ request, actor }) => {
      const body = await readJson<{ siteId: number; serial: string; place: string }>(request)
      const errors: Record<string, string[]> = {}
      if (typeof body.siteId !== 'number') errors.siteId = ['Field required']
      if (!body.serial?.trim()) errors.serial = ['Field required']
      if (!body.place?.trim()) errors.place = ['Field required']
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      const siteId = body.siteId!
      const invalid = hub(siteId, request)
      if (invalid) return invalid
      const site = db.collection('sites').get(siteId)!
      let scanned = normalizeSerial(body.serial!)
      const place = normalizePlace(body.place!)
      if (!place) {
        const shown = body.place!.trim().toUpperCase()
        return json(
          scanResult(
            'invalid_place',
            `'${shown}' is not an installation place (expected e.g. B4-12).`,
            scanned,
          ),
        )
      }
      const asset = findAsset(body.serial!)
      if (!asset)
        return json(
          scanResult('unknown_serial', `Serial ${scanned} is not in stock records.`, scanned),
        )
      scanned = asset.serialNumber
      if (asset.status !== 'available' || asset.serviceRequestId !== null) {
        const linked = sr(asset.serviceRequestId ?? undefined)
        const message = linked
          ? `Asset is ${asset.status} for ${linked.number}.`
          : `${device(asset)} is ${asset.status}.`
        return json(scanResult('not_available', message, scanned, { entity: assetSummary(asset) }))
      }
      const location = locationRow(asset.locationId)
      if (!location || !['goods_in', 'staging'].includes(location.type)) {
        return json(
          scanResult(
            'not_in_stock',
            `${device(asset)} is in ${location?.name ?? 'an unknown location'}, not in hub stock.`,
            scanned,
            { entity: assetSummary(asset) },
          ),
        )
      }
      const staging = stagingOf(site.id)
      if (!staging) return problems.notFound('Staging location of site', site.id, request)
      if (location.id === staging.id && asset.installationPlace === place) {
        return json(
          scanResult('unchanged', `${device(asset)} is already on ${place}.`, scanned, {
            entity: assetSummary(asset),
          }),
        )
      }
      const warnings: [string, string][] = []
      if (location.siteId !== site.id)
        warnings.push([
          'moved_from_other_site',
          `Moved from ${location.name} — the asset is physically at ${site.name}.`,
        ])
      const occupant = db
        .collection('assets')
        .find(
          (a) =>
            a.locationId === staging.id &&
            a.installationPlace === place &&
            a.status === 'available' &&
            a.id !== asset.id,
        )
      if (occupant) warnings.push(['place_occupied', `${place} also holds ${device(occupant)}.`])
      if (asset.articleId === null)
        warnings.push([
          'unknown_model',
          `Model '${asset.model ?? 'unknown'}' is not in the article catalogue.`,
        ])
      const moved = moveAsset(asset.id, 'place', {
        toStatus: 'available',
        toLocationId: staging.id,
        installationPlace: place,
        actor,
        trigger: 'user',
        sourceRef: 'scan:installation_place',
      })!
      const movement = db
        .collection('asset_movements')
        .filter((m) => m.assetId === asset.id)
        .sort((a, b) => b.id - a.id)[0]!
      const placed = `${device(asset)} → ${place} · ${staging.name}`
      const undo = {
        method: 'POST' as const,
        href: '/scan/installation-place/undo',
        body: { movementId: movement.id },
      }
      const [first, ...rest] = warnings
      const extra = rest.map(([, text]) => text).join(' ')
      return json(
        scanResult(
          first ? first[0] : 'placed',
          first ? `${placed}. ${first[1]}${extra ? ` ${extra}` : ''}` : placed,
          scanned,
          { applied: true, entity: assetSummary(moved), undo },
        ),
      )
    }),
  ),
  http.post(
    apiPath('/scan/installation-place/undo'),
    authed('staging.scan', async ({ request, actor }) => {
      const body = await readJson<{ movementId: number }>(request)
      if (typeof body.movementId !== 'number')
        return problems.validation({ movementId: ['Field required'] }, undefined, request)
      const movement = db.collection('asset_movements').get(body.movementId)
      if (!movement) return problems.notFound('Movement', body.movementId, request)
      const impossible = (detail: string) =>
        problem(409, 'undo_not_possible', 'Undo not possible', { detail, request })
      if (movement.action !== 'place')
        return impossible('Only installation place scans can be undone here.')
      const latest = db
        .collection('asset_movements')
        .filter((m) => m.assetId === movement.assetId)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id - a.id)[0]
      if (latest?.id !== movement.id)
        return impossible('The asset was moved again since this scan.')
      const asset = db.collection('assets').get(movement.assetId)
      if (asset?.status !== 'available' || asset.serviceRequestId !== null)
        return impossible('The asset is no longer available.')
      const from = movement.fromLocationId ? locationRow(movement.fromLocationId) : undefined
      if (!from) return impossible('The scan has no previous location.')
      const backToPlace = from.type === 'staging' && movement.fromInstallationPlace !== null
      const reverted = moveAsset(asset.id, backToPlace ? 'place' : 'correct', {
        toStatus: 'available',
        toLocationId: from.id,
        installationPlace: movement.fromInstallationPlace,
        actor,
        trigger: 'user',
        reason: backToPlace ? null : `Undo of installation place scan (movement ${movement.id})`,
        sourceRef: `undo:${movement.id}`,
      })!
      return json(
        scanResult(
          'undone',
          `Undone: ${device(asset)} is back at ${movement.fromInstallationPlace ?? from.name}.`,
          asset.serialNumber,
          { applied: true, entity: assetSummary(reverted) },
        ),
      )
    }),
  ),
  http.get(
    apiPath('/staging/installation-places'),
    authed('stock.read', ({ request }) => {
      const params = new URL(request.url).searchParams
      const siteId = intParam(params.get('siteId') ?? undefined)
      if (siteId !== undefined && !db.collection('sites').get(siteId))
        return problems.notFound('Site', siteId, request)
      let prefix = params.get('q')?.trim().toUpperCase() ?? ''
      if (prefix.startsWith('LOC:')) prefix = prefix.slice(4).trim()
      const stagingIds = new Set(
        db
          .collection('stock_locations')
          .filter((l) => l.type === 'staging' && (siteId === undefined || l.siteId === siteId))
          .map((l) => l.id),
      )
      const groups = new Map<string, ReturnType<typeof assetSummary>[]>()
      const assets = db
        .collection('assets')
        .all()
        .sort((a, b) => a.id - b.id)
      for (const asset of assets) {
        const place = asset.installationPlace
        if (!place || !stagingIds.has(asset.locationId) || !place.startsWith(prefix)) continue
        groups.set(place, [...(groups.get(place) ?? []), assetSummary(asset)])
      }
      const key = (place: string) =>
        place
          .split(/(\d+)/)
          .map((part) => (/^\d+$/.test(part) ? part.padStart(4, '0') : part))
          .join('')
      return listOf(
        [...groups.entries()]
          .sort(([a], [b]) => key(a).localeCompare(key(b)))
          .map(([place, list]) => ({ place, assets: list })),
      )
    }),
  ),
]

// ---- personalization (§6.2) --------------------------------------------------------------------

function queueItem(row: ServiceRequestRow, actor: MockActor): PersonalizationQueueItem {
  const newItems = newItemsOf(row.id)
  return {
    ...srListItem(row, actor),
    items: itemDtos(row.id),
    stockHints: newItems.map((item) => {
      const { count, first } = stockHint(item.articleId, row.supplyingSiteId)
      return {
        slot: item.slot,
        article: articleRef(item.articleId),
        availableCount: count,
        suggested: summaryOf(first),
      }
    }),
    allNewItemsAssigned: newItems.every((item) => item.assetId !== null),
  }
}

const personalizationHandlers: RequestHandler[] = [
  http.get(
    apiPath('/personalization/queue'),
    authed('sr.read', ({ request, actor }) => {
      const params = new URL(request.url).searchParams
      const siteId = intParam(params.get('siteId') ?? undefined)
      const invalid = hub(siteId, request)
      if (invalid) return invalid
      const statuses = multiValue(params, 'status')
      const bad = statuses.filter((s) => !QUEUE_STATUSES.includes(s as ServiceRequestStatus))
      if (bad.length)
        return problems.validation(
          { status: bad.map((s) => `Unknown queue status '${s}'.`) },
          undefined,
          request,
        )
      const wanted: readonly string[] = statuses.length ? statuses : QUEUE_STATUSES
      const editor = params.get('editorId')
      if (editor && !['me', 'none'].includes(editor) && !/^\d+$/.test(editor))
        return problems.validation(
          { editorId: ["Use 'me', 'none' or a user id."] },
          undefined,
          request,
        )
      const from = params.get('appointmentFrom')
      const to = params.get('appointmentTo')
      const rows = db.collection('service_requests').filter((row) => {
        if (row.supplyingSiteId !== siteId || !wanted.includes(row.status)) return false
        if (editor === 'me' && row.editorUserId !== actor.id) return false
        if (editor === 'none' && row.editorUserId !== null) return false
        if (editor && /^\d+$/.test(editor) && row.editorUserId !== Number(editor)) return false
        return inRange(row, from, to)
      })
      const queried = queryRows(rows, request, {
        filters: {
          regionId: regionFilter,
          procurementType: (row, values) =>
            values.includes((row.procurementType ?? '') as ProcurementType),
        },
        search: srSearch,
        sortable: {
          appointmentStartAt: (row) => row.appointmentStartAt,
          number: (row) => row.number,
          claimedAt: (row) => row.claimedAt,
        },
        defaultSort: 'appointmentStartAt',
      })
      if (queried instanceof Response) return queried
      const page = paginate(queried, parsePage(params))
      return json({ data: page.data.map((row) => queueItem(row, actor)), meta: page.meta })
    }),
  ),
  http.get(
    apiPath('/service-requests/:id/asset-candidates'),
    authed<{ id: string }>('sr.read', ({ request, params }) => {
      const row = sr(intParam(params.id))
      if (!row) return problems.notFound('Service request', params.id, request)
      const slot = slotParam(new URL(request.url).searchParams.get('slot'), request)
      if (slot instanceof Response) return slot
      const item = itemFor(row, slot, request)
      if (item instanceof Response) return item
      if (row.supplyingSiteId === null)
        return problems.conflict(`${row.number} has no supplying hub (region unresolved).`, request)
      const candidates =
        item.articleId === null
          ? []
          : fifoCandidates(item.articleId, row.supplyingSiteId).slice(0, 50)
      const today = businessToday()
      const result: AssetCandidates = {
        slot,
        article: articleRef(item.articleId),
        site: siteRef(row.supplyingSiteId)!,
        suggestedAssetId: candidates[0]?.id ?? null,
        data: candidates.map((asset, index) => ({
          asset: assetSummary(asset),
          checkedInAt: asset.checkedInAt,
          ageDays: ageDays(asset.checkedInAt, today),
          fifoRank: index + 1,
        })),
      }
      return json(result)
    }),
  ),
  http.post(
    apiPath('/service-requests/:id/items/:slot/assignment'),
    authed<{ id: string; slot: string }>(
      'staging.personalize',
      async ({ request, params, actor }) => {
        const row = sr(intParam(params.id))
        if (!row) return problems.notFound('Service request', params.id, request)
        const body = await readJson<{ serial: string }>(request)
        if (typeof body.serial !== 'string' || !body.serial.trim())
          return problems.validation({ serial: ['Field required'] }, undefined, request)
        const slot = slotParam(params.slot, request)
        if (slot instanceof Response) return slot
        const item = itemFor(row, slot, request)
        if (item instanceof Response) return item
        const blocked = assignableProblem(row, actor, request)
        if (blocked) return blocked
        let scanned = normalizeSerial(body.serial)
        const href = `/service-requests/${row.id}/items/${slot}/assignment`
        const reply = (code: string, message: string, applied = false) => {
          const current = db.collection('service_request_items').get(item.id)!
          const items = newItemsOf(row.id)
          return json(
            scanResult(code, message, scanned, {
              applied,
              entity: srItem(current),
              undo: applied ? { method: 'DELETE', href, body: null } : null,
              progress: {
                done: items.filter((i) => i.assetId !== null).length,
                total: items.length,
              },
            }),
          )
        }
        const asset = findAsset(body.serial)
        if (!asset) return reply('unknown_serial', `Serial ${scanned} is not in stock records.`)
        scanned = asset.serialNumber
        if (item.articleId === null)
          return reply(
            'unknown_article',
            `Ordered type '${item.requestedType ?? '?'}' is not in the article catalogue.`,
          )
        if (asset.articleId !== item.articleId) {
          const expected = articleRef(item.articleId)?.name ?? item.requestedType ?? '?'
          return reply('wrong_article', `Scanned ${articleName(asset)}, expected ${expected}.`)
        }
        if (item.assetId === asset.id)
          return reply('unchanged', `${device(asset)} is already assigned to ${slotLabel(slot)}.`)
        if (asset.status !== 'available' || asset.serviceRequestId !== null) {
          const other = sr(asset.serviceRequestId ?? undefined)
          const where = other ? (other.id === row.id ? 'this request' : other.number) : null
          return reply(
            'not_available',
            where ? `Asset is ${asset.status} for ${where}.` : `Asset is ${asset.status}.`,
          )
        }
        const location = locationRow(asset.locationId)
        const siteId = row.supplyingSiteId
        if (location?.type !== 'staging' || siteId === null || location.siteId !== siteId) {
          const hubName = siteId ? (db.collection('sites').get(siteId)?.name ?? 'no hub') : 'no hub'
          return reply(
            'wrong_location',
            `Asset is in ${location?.name ?? 'an unknown location'}; this request is supplied by ${hubName}.`,
          )
        }
        if (asset.installationPlace === null)
          return reply('no_installation_place', 'Scan an installation place for this asset first.')
        const first = fifoCandidates(item.articleId, siteId)[0]
        if (item.assetId !== null) {
          const previous = db.collection('assets').get(item.assetId)
          if (previous?.status === 'assigned')
            moveAsset(previous.id, 'unassign', {
              toStatus: 'available',
              serviceRequestId: null,
              actor,
              trigger: 'user',
            })
        }
        moveAsset(asset.id, 'assign', {
          toStatus: 'assigned',
          serviceRequestId: row.id,
          actor,
          trigger: 'user',
        })
        db.collection('service_request_items').update(item.id, {
          assetId: asset.id,
          assignedAt: new Date().toISOString(),
          assignedBy: actor.id,
          packedAt: null,
          packedBy: null,
        })
        if (first && first.id !== asset.id)
          return reply(
            'not_fifo',
            `Assigned. Note: ${device(first)} (${first.installationPlace ?? '?'}) was in stock longer.`,
            true,
          )
        return reply(
          'assigned',
          `${articleName(asset)} ${device(asset)} assigned to ${slotLabel(slot)}.`,
          true,
        )
      },
    ),
  ),
  http.delete(
    apiPath('/service-requests/:id/items/:slot/assignment'),
    authed<{ id: string; slot: string }>('staging.personalize', ({ request, params, actor }) => {
      const row = sr(intParam(params.id))
      if (!row) return problems.notFound('Service request', params.id, request)
      const slot = slotParam(params.slot, request)
      if (slot instanceof Response) return slot
      const item = itemFor(row, slot, request)
      if (item instanceof Response) return item
      const blocked = assignableProblem(row, actor, request)
      if (blocked) return blocked
      if (item.assetId !== null) {
        const asset = db.collection('assets').get(item.assetId)
        if (asset?.status === 'assigned')
          moveAsset(asset.id, 'unassign', {
            toStatus: 'available',
            serviceRequestId: null,
            actor,
            trigger: 'user',
          })
        db.collection('service_request_items').update(item.id, {
          assetId: null,
          assignedAt: null,
          assignedBy: null,
          packedAt: null,
          packedBy: null,
        })
      }
      return json(srItem(db.collection('service_request_items').get(item.id)!))
    }),
  ),
  http.patch(
    apiPath('/service-requests/:id/staging'),
    authed<{ id: string }>('staging.personalize', async ({ request, params, actor }) => {
      const row = sr(intParam(params.id))
      if (!row) return problems.notFound('Service request', params.id, request)
      const body = await readJson<Record<string, unknown>>(request)
      const extra = extraFields(body, ['osReinstall', 'addedSoftware', 'version'], request)
      if (extra) return extra
      if (
        'osReinstall' in body &&
        body.osReinstall !== null &&
        !(
          typeof body.osReinstall === 'string' &&
          ['on_pickup', 'on_delivery'].includes(body.osReinstall)
        )
      )
        return problems.validation(
          { osReinstall: ["Input should be 'on_pickup' or 'on_delivery'"] },
          undefined,
          request,
        )
      if (typeof body.version === 'number' && body.version !== row.version)
        return problem(409, 'version_conflict', 'Version conflict', {
          detail: 'The resource was changed by someone else. Reload and try again.',
          currentVersion: row.version,
          request,
        })
      if (
        !['appointment_booked', 'personalization_in_progress', 'personalization_done'].includes(
          row.status,
        )
      )
        return problems.conflict('Staging options are locked once the order is closed.', request)
      const blocked = isEditorProblem(row, actor, request)
      if (blocked) return blocked
      const patch: Partial<ServiceRequestRow> = {}
      if ('osReinstall' in body)
        patch.osReinstall = (body.osReinstall ?? null) as ServiceRequestRow['osReinstall']
      if (Array.isArray(body.addedSoftware))
        patch.addedSoftware = dedupeSoftware(body.addedSoftware.map(String))
      return json(srDetail(bump(row, patch), actor))
    }),
  ),
  http.get(
    apiPath('/service-requests/:id/software-checklist'),
    authed<{ id: string }>('sr.read', ({ request, params }) => {
      const row = sr(intParam(params.id))
      if (!row) return problems.notFound('Service request', params.id, request)
      return json(checklistOf(row))
    }),
  ),
  http.put(
    apiPath('/service-requests/:id/software-checklist'),
    authed<{ id: string }>(null, async ({ request, params, actor }) => {
      if (
        !actor.permissions.includes('staging.personalize') &&
        !actor.permissions.includes('staging.close')
      )
        return problems.forbidden(undefined, request)
      const row = sr(intParam(params.id))
      if (!row) return problems.notFound('Service request', params.id, request)
      const body = await readJson<{ installedSoftware: unknown; addedSoftware: unknown }>(request)
      const errors: Record<string, string[]> = {}
      if (!Array.isArray(body.installedSoftware)) errors.installedSoftware = ['Field required']
      if (!Array.isArray(body.addedSoftware)) errors.addedSoftware = ['Field required']
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      if (!['personalization_in_progress', 'personalization_done'].includes(row.status))
        return problems.conflict(
          'The software checklist can only change during personalization or order closing.',
          request,
        )
      const result = checklist(
        row.requestedSoftware,
        (body.addedSoftware as unknown[]).map(String),
        (body.installedSoftware as unknown[]).map(String),
      )
      bump(row, { addedSoftware: result.added, installedSoftware: result.installed })
      return json(result)
    }),
  ),
]

// ---- order closing + technician picking (§6.3, §6.4) --------------------------------------------

const closingHandlers: RequestHandler[] = [
  http.get(
    apiPath('/order-closing/queue'),
    authed('sr.read', ({ request, actor }) => {
      const params = new URL(request.url).searchParams
      const siteId = intParam(params.get('siteId') ?? undefined)
      const invalid = hub(siteId, request)
      if (invalid) return invalid
      const complete = boolValue(params, 'checklistComplete')
      const from = params.get('appointmentFrom')
      const to = params.get('appointmentTo')
      const rows = db.collection('service_requests').filter((row) => {
        if (row.status !== 'personalization_done' || row.supplyingSiteId !== siteId) return false
        if (complete !== undefined && checklistOf(row).complete !== complete) return false
        return inRange(row, from, to)
      })
      const queried = queryRows(rows, request, {
        filters: { regionId: regionFilter },
        search: srSearch,
        sortable: {
          appointmentStartAt: (row) => row.appointmentStartAt,
          number: (row) => row.number,
        },
        defaultSort: 'appointmentStartAt',
      })
      if (queried instanceof Response) return queried
      const page = paginate(queried, parsePage(params))
      const data: OrderClosingQueueItem[] = page.data.map((row) => ({
        ...srListItem(row, actor),
        items: itemDtos(row.id),
        checklist: checklistOf(row),
        osReinstall: row.osReinstall,
      }))
      return json({ data, meta: page.meta })
    }),
  ),
  http.get(
    apiPath('/picking/technician'),
    authed('sr.read', ({ request, actor }) => {
      const params = new URL(request.url).searchParams
      const siteId = intParam(params.get('siteId') ?? undefined)
      const invalid = hub(siteId, request)
      if (invalid) return invalid
      const day = params.get('date') ?? businessToday()
      const rows = db
        .collection('service_requests')
        .filter(
          (row) =>
            ['ready_for_picking', 'provided'].includes(row.status) &&
            row.supplyingSiteId === siteId &&
            effectiveDeliveryType(row) === 'technician' &&
            appointmentDay(row) === day,
        )
        .sort(
          (a, b) =>
            (a.appointmentCalendarName ?? '~').localeCompare(b.appointmentCalendarName ?? '~') ||
            (a.appointmentStartAt ?? '').localeCompare(b.appointmentStartAt ?? '') ||
            a.id - b.id,
        )
      const groups = new Map<string, TechnicianPicking['groups'][number]>()
      for (const row of rows) {
        const key = `${row.appointmentCalendarId ?? ''}|${row.appointmentCalendarName ?? ''}`
        const group = groups.get(key) ?? {
          calendar: { id: row.appointmentCalendarId, name: row.appointmentCalendarName },
          serviceRequests: [],
        }
        group.serviceRequests.push({
          ...srListItem(row, actor),
          items: itemDtos(row.id),
          picked: row.status === 'provided',
        })
        groups.set(key, group)
      }
      const picked = rows.filter((row) => row.status === 'provided').length
      const result: TechnicianPicking = {
        date: day,
        site: siteRef(siteId)!,
        groups: [...groups.values()],
        totals: { toPick: rows.length - picked, picked },
      }
      return json(result)
    }),
  ),
]

// ---- parcel packing + shipments (§6.5, §6.6) -----------------------------------------------------

function packingProblem(row: ServiceRequestRow, request: Request): Response | null {
  if (row.status !== 'ready_for_picking')
    return problems.conflict(
      `${row.number} is not ready for packing (status '${row.status}').`,
      request,
    )
  if (!PARCEL.includes(effectiveDeliveryType(row)!)) {
    const message = 'This request is delivered by a technician.'
    return problem(409, 'guard_failed', 'Precondition failed', {
      detail: message,
      guard: { code: 'delivery_type_is_parcel', message },
      request,
    })
  }
  return null
}

/** The stored label of a shipment; rendered (demo PDF) on first request. */
function labelFor(shipment: ShipmentRow, actorId: number | null) {
  const files = db.collection('stored_files')
  const existing = shipment.labelFileId ? files.get(shipment.labelFileId) : undefined
  if (existing?.contentBase64) return existing
  const owner = db.collection('service_requests').get(shipment.serviceRequestId)
  const pages = shipment.trackingUrls.map((url, index) => ({
    title: `Parcel ${index + 1} of ${shipment.parcelCount} - DEMO LABEL, NOT FOR SHIPPING`,
    lines: [
      `Shipment ${shipment.carrierShipmentId}`,
      `Reference ${owner?.number ?? ''}`,
      `To: ${shipment.recipientName}`,
      shipment.deliveryStreet,
      `${shipment.deliveryZip} ${shipment.deliveryCity}`,
      shipment.deliveryCountry,
      `Tracking: ${url}`,
    ],
  }))
  const returns = shipment.returnTrackingUrls.map((url, index) => ({
    title: `Return parcel ${index + 1} - DEMO LABEL, NOT FOR SHIPPING`,
    lines: [`Shipment ${shipment.carrierShipmentId}`, `Tracking: ${url}`],
  }))
  const file = storeFile({
    filename: `label-${owner?.number ?? 'SR'}-${shipment.carrierShipmentId}.pdf`,
    contentType: 'application/pdf',
    body: simplePdf([...pages, ...returns]),
    purpose: 'label',
    entity: { type: 'service_request', id: shipment.serviceRequestId },
    actorId,
    ttlHours: null,
  })
  db.collection('shipments').update(shipment.id, { labelFileId: file.id })
  return file
}

function nextCarrierId(): string {
  const day = businessToday().replaceAll('-', '')
  const taken = new Set(
    db
      .collection('shipments')
      .all()
      .map((s) => s.carrierShipmentId),
  )
  for (let n = 1; ; n++) {
    const id = `PC${day}${String(n).padStart(6, '0')}`
    if (!taken.has(id)) return id
  }
}

const shippingHandlers: RequestHandler[] = [
  http.get(
    apiPath('/picking/parcel'),
    authed('sr.read', ({ request, actor }) => {
      const params = new URL(request.url).searchParams
      const siteId = intParam(params.get('siteId') ?? undefined)
      if (siteId !== undefined) {
        const invalid = hub(siteId, request)
        if (invalid) return invalid
      }
      const types = multiValue(params, 'deliveryType').filter((t) =>
        PARCEL.includes(t as DeliveryType),
      )
      const wanted: readonly string[] = types.length ? types : PARCEL
      const to = params.get('appointmentTo')
      const q = params.get('q')?.trim()
      const rows = db
        .collection('service_requests')
        .filter((row) => {
          if (row.status !== 'ready_for_picking') return false
          if (!wanted.includes(effectiveDeliveryType(row) ?? '')) return false
          if (siteId !== undefined && row.supplyingSiteId !== siteId) return false
          if (!inRange(row, null, to)) return false
          return !q || srSearch(row, q)
        })
        .sort(
          (a, b) =>
            (a.appointmentStartAt ?? '~').localeCompare(b.appointmentStartAt ?? '~') || a.id - b.id,
        )
        .slice(0, 200)
      const data: ParcelPickingItem[] = rows.map((row) => ({
        ...srListItem(row, actor),
        items: itemDtos(row.id),
        allPacked: newItemsOf(row.id).every((item) => item.packedAt !== null),
        hasOldItems: oldItemsOf(row.id).length > 0,
        shipTo: shipTo(row),
      }))
      return listOf(data)
    }),
  ),
  http.post(
    apiPath('/scan/parcel'),
    authed('fulfilment.ship', async ({ request, actor }) => {
      const body = await readJson<{ serviceRequestId: number; serial: string }>(request)
      const errors: Record<string, string[]> = {}
      if (typeof body.serviceRequestId !== 'number') errors.serviceRequestId = ['Field required']
      if (typeof body.serial !== 'string' || !body.serial.trim()) errors.serial = ['Field required']
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      const row = sr(body.serviceRequestId)
      if (!row) return problems.notFound('Service request', body.serviceRequestId, request)
      const blocked = packingProblem(row, request)
      if (blocked) return blocked
      let scanned = normalizeSerial(body.serial!)
      const progress = () => {
        const items = newItemsOf(row.id)
        return { done: items.filter((i) => i.packedAt !== null).length, total: items.length }
      }
      const asset = findAsset(body.serial!)
      if (!asset)
        return json(
          scanResult('unknown_serial', `Serial ${scanned} is not in stock records.`, scanned, {
            progress: progress(),
          }),
        )
      scanned = asset.serialNumber
      const item = newItemsOf(row.id).find((i) => i.assetId === asset.id)
      if (!item)
        return json(
          scanResult(
            'not_on_this_request',
            `${asset.assetTag ?? scanned} is not assigned to ${row.number}.`,
            scanned,
            { progress: progress() },
          ),
        )
      if (item.packedAt !== null)
        return json(
          scanResult(
            'already_packed',
            `${device(asset)} (${slotLabel(item.slot)}) is already packed.`,
            scanned,
            { entity: srItem(item), progress: progress() },
          ),
        )
      const packed = db.collection('service_request_items').update(item.id, {
        packedAt: new Date().toISOString(),
        packedBy: actor.id,
      })!
      const now = progress()
      return json(
        scanResult(
          'packed',
          `${articleName(asset)} ${device(asset)} packed (${now.done}/${now.total}).`,
          scanned,
          {
            applied: true,
            entity: srItem(packed),
            undo: {
              method: 'DELETE',
              href: `/service-requests/${row.id}/items/${item.slot}/packing`,
              body: null,
            },
            progress: now,
          },
        ),
      )
    }),
  ),
  http.delete(
    apiPath('/service-requests/:id/items/:slot/packing'),
    authed<{ id: string; slot: string }>('fulfilment.ship', ({ request, params }) => {
      const row = sr(intParam(params.id))
      if (!row) return problems.notFound('Service request', params.id, request)
      const slot = slotParam(params.slot, request)
      if (slot instanceof Response) return slot
      const item = itemFor(row, slot, request)
      if (item instanceof Response) return item
      const blocked = packingProblem(row, request)
      if (blocked) return blocked
      const updated = db
        .collection('service_request_items')
        .update(item.id, { packedAt: null, packedBy: null })!
      return json(srItem(updated))
    }),
  ),
  // `ship` is never dispatched through the generic action endpoint (SPEC_RESOLUTIONS #15).
  http.post(apiPath('/service-requests/:id/actions/ship'), ({ request }) =>
    problem(404, 'unknown_action', 'Unknown action', { detail: "Unknown action 'ship'.", request }),
  ),
  http.post(
    apiPath('/service-requests/:id/shipments'),
    authed<{ id: string }>('fulfilment.ship', async ({ request, params, actor }) => {
      const row = sr(intParam(params.id))
      if (!row) return problems.notFound('Service request', params.id, request)
      const body = await readJson<Record<string, unknown>>(request)
      const extra = extraFields(
        body,
        ['includeReturnLabel', 'combinedParcel', 'sendConfirmation', 'version'],
        request,
      )
      if (extra) return extra
      const includeReturnLabel = body.includeReturnLabel !== false
      const combinedParcel = body.combinedParcel === true
      const sendConfirmation = body.sendConfirmation !== false
      const target = shipTo(row)
      const oldCount = oldItemsOf(row.id).length
      const newCount = newItemsOf(row.id).length
      // The fake carrier rejects zip 00000 (SPEC §8.2) — only once the guards pass.
      if (
        target.address.zip?.trim() === '00000' &&
        evaluateActions('serviceRequest', row, actor).availableActions.includes('ship') &&
        (typeof body.version !== 'number' || body.version === row.version)
      )
        return problem(502, 'carrier_error', 'Carrier error', {
          detail: 'Recipient address rejected by carrier',
          request,
        })
      const result = applyAction<ServiceRequestRow>('serviceRequest', row.id, 'ship', {
        actor,
        payload: {
          ...(typeof body.version === 'number' ? { version: body.version } : {}),
          includeReturnLabel: includeReturnLabel && oldCount > 0,
          combinedParcel,
          sendConfirmation,
        },
        request,
      })
      if (!result.ok) return result.response
      const id = nextCarrierId()
      const parcels = combinedParcel ? 1 : Math.max(newCount, 1)
      const returns = includeReturnLabel ? oldCount : 0
      const parcelIds = Array.from({ length: parcels }, (_, i) => `${id}-${i + 1}`)
      const returnIds = Array.from({ length: returns }, (_, i) => `${id}-${parcels + i + 1}`)
      const warnings: string[] = []
      if (includeReturnLabel && oldCount === 0) warnings.push('no_return_items')
      const contact = db.collection('contacts').get(row.contactId)
      const confirmation = sendConfirmation && Boolean(contact?.email)
      if (sendConfirmation && !confirmation) warnings.push('no_contact_email')
      const now = new Date().toISOString()
      const shipment = db.collection('shipments').insert({
        serviceRequestId: row.id,
        carrierShipmentId: id,
        parcelCount: parcels,
        trackingUrls: parcelIds.map((p) => `${TRACK}/${p}`),
        returnTrackingUrls: returnIds.map((p) => `${TRACK}/return/${p}R`),
        includeReturnLabel: returns > 0,
        combinedParcel,
        confirmationMailSent: confirmation,
        recipientName: target.recipientName,
        deliveryStreet: target.address.street ?? '',
        deliveryZip: target.address.zip ?? '',
        deliveryCity: target.address.city ?? '',
        deliveryCountry: target.address.country ?? 'Freeland',
        labelFileId: null,
        createdBy: actor.id,
        createdAt: now,
        updatedAt: now,
      })
      const label = labelFor(shipment, actor.id)
      if (confirmation) {
        // `sr.shipping_confirmation` through the mock core notify(), as the backend queues it
        notify({
          templateId: 'sr.shipping_confirmation',
          to: [contact?.email],
          subject: `Your hardware for ${row.number} is on its way`,
          context: { sr_number: row.number, tracking_urls: shipment.trackingUrls },
          entity: { type: 'service_request', id: row.id, label: row.number },
          attachments: [],
          trigger: 'user',
          actorId: actor.id,
        })
      }
      const created: ShipmentCreated = {
        shipment: shipmentDto(db.collection('shipments').get(shipment.id)!),
        serviceRequest: srDetail(db.collection('service_requests').get(row.id)!, actor),
        label: downloadLink(label),
        warnings,
      }
      return json(created, 201)
    }),
  ),
  http.get(
    apiPath('/service-requests/:id/shipments'),
    authed<{ id: string }>('sr.read', ({ request, params }) => {
      const row = sr(intParam(params.id))
      if (!row) return problems.notFound('Service request', params.id, request)
      return listOf(
        db
          .collection('shipments')
          .filter((s) => s.serviceRequestId === row.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
          .map(shipmentDto),
      )
    }),
  ),
  http.get(
    apiPath('/shipments'),
    authed('sr.read', ({ request }) => {
      const params = new URL(request.url).searchParams
      const sites = multiValue(params, 'siteId').map(Number)
      const from = params.get('from')
      const to = params.get('to')
      const q = params.get('q')?.trim().toLowerCase()
      const rows = db
        .collection('shipments')
        .filter((s) => {
          const owner = db.collection('service_requests').get(s.serviceRequestId)
          if (sites.length && !sites.includes(owner?.supplyingSiteId ?? -1)) return false
          const day = toBusinessDate(s.createdAt)
          if (from && day < from) return false
          if (to && day > to) return false
          if (!q) return true
          return [owner?.number, s.carrierShipmentId, s.recipientName]
            .join(' ')
            .toLowerCase()
            .includes(q)
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
      const page = paginate(rows, parsePage(params))
      return json({ data: page.data.map(shipmentDto), meta: page.meta })
    }),
  ),
  http.get(
    apiPath('/shipments/:id/label'),
    authed<{ id: string }>('fulfilment.ship', ({ request, params, actor }) => {
      const shipment = db.collection('shipments').get(intParam(params.id))
      if (!shipment) return problems.notFound('Shipment', params.id, request)
      return json(downloadLink(labelFor(shipment, actor.id)))
    }),
  ),
]

export const handlers: RequestHandler[] = [
  ...installationPlaceHandlers,
  ...personalizationHandlers,
  ...closingHandlers,
  ...shippingHandlers,
]
