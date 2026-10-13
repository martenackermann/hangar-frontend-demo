import { db } from '@/mocks/db'
import type { AssetRow } from '@/mocks/fixtures/types'
import { registerEffect, registerValidator } from '@/mocks/workflow'
import { DEACTIVATED, normalizePlace, STOCK_TYPES } from './common'

/**
 * H5 rules for the asset actions (SPEC §4.3, SPEC_RESOLUTIONS #24). The core mock already moves
 * the asset for `mark_missing` / `mark_found` / `correct`; H5 adds the API's validation (place
 * format, target location kind, `correct` invariants → 422) and aligns the ledger/fields with
 * `AssetService` (from-status of `mark_missing`, normalised places, cleared place/SR link).
 * `deactivate` stays internal (only through `POST /deactivations`).
 */

const WORKFLOW = new Set(['assigned', 'prepared', 'provided'])
type Errors = Record<string, string[]> | null

function lastMovement(assetId: number) {
  return db
    .collection('asset_movements')
    .filter((m) => m.assetId === assetId)
    .sort((a, b) => b.id - a.id)[0]
}

registerValidator<AssetRow>('asset', 'mark_found', ({ payload }): Errors => {
  const location = db.collection('stock_locations').get(Number(payload.locationId))
  if (!location) return null // core: "Choose the location where the device was found."
  if (location.siteId === null || !(STOCK_TYPES.has(location.type) || location.type === 'return'))
    return { locationId: ['Choose a stock or returns location.'] }
  const raw = payload.installationPlace
  if (typeof raw === 'string' && raw.trim()) {
    if (!normalizePlace(raw)) return { installationPlace: ['Use the format B4-12 (shelf-slot).'] }
    if (location.type !== 'staging')
      return { installationPlace: ['Installation places exist only in staging locations.'] }
  }
  return null
})

registerValidator<AssetRow>('asset', 'correct', ({ row, payload }): Errors => {
  const status = typeof payload.status === 'string' ? payload.status : row.status
  const locationId = typeof payload.locationId === 'number' ? payload.locationId : row.locationId
  const location = db.collection('stock_locations').get(locationId)
  if (!location) return { locationId: ['Unknown stock location.'] }
  let place: string | null = row.installationPlace
  if ('installationPlace' in payload) {
    const raw = payload.installationPlace
    if (typeof raw === 'string' && raw.trim()) {
      place = normalizePlace(raw)
      if (!place) return { installationPlace: ['Use the format B4-12 (shelf-slot).'] }
    } else place = null
  } else if (locationId !== row.locationId) place = null
  const srLinked =
    row.serviceRequestId !== null &&
    !(DEACTIVATED.has(status) || ['available', 'missing'].includes(status))
  const problems: string[] = []
  if (WORKFLOW.has(status) && !srLinked)
    problems.push(`Status '${status}' requires a linked service request.`)
  if (status === 'provided' && location.type !== 'in_transit')
    problems.push('Provided assets must be in transit.')
  if (status === 'in_use' && location.type !== 'in_use')
    problems.push('Assets in use must be at the user.')
  if (DEACTIVATED.has(status) !== (location.type === 'off_fleet'))
    problems.push('Deactivated assets (and only those) are off fleet.')
  if (place !== null && location.type !== 'staging')
    problems.push('An installation place requires a staging location.')
  if (status === 'available' && !STOCK_TYPES.has(location.type))
    problems.push('Available assets must be in a stock location.')
  if (status === 'collected' && location.type !== 'return')
    problems.push('Collected assets must be at a returns location.')
  return problems.length ? { status: problems } : null
})

registerEffect<AssetRow>('asset', 'mark_missing', ({ updated, from }) => {
  const movement = lastMovement(updated.id)
  if (movement?.action === 'mark_missing' && movement.fromStatus === null)
    db.collection('asset_movements').update(movement.id, {
      fromStatus: from as AssetRow['status'],
    })
})

registerEffect<AssetRow>('asset', 'mark_found', ({ updated, payload }) => {
  const place =
    typeof payload.installationPlace === 'string' ? normalizePlace(payload.installationPlace) : null
  const asset = db.collection('assets').get(updated.id)
  if (!asset || asset.installationPlace === place) return
  db.collection('assets').update(updated.id, { installationPlace: place })
  const movement = lastMovement(updated.id)
  if (movement?.action === 'mark_found')
    db.collection('asset_movements').update(movement.id, { toInstallationPlace: place })
})

registerEffect<AssetRow>('asset', 'correct', ({ row, updated, payload }) => {
  const asset = db.collection('assets').get(updated.id)
  if (!asset) return
  const patch: Partial<AssetRow> = {}
  if ('installationPlace' in payload) {
    const raw = payload.installationPlace
    patch.installationPlace = typeof raw === 'string' && raw.trim() ? normalizePlace(raw) : null
  } else if (asset.locationId !== row.locationId) patch.installationPlace = null
  if (DEACTIVATED.has(asset.status) || asset.status === 'available' || asset.status === 'missing')
    patch.serviceRequestId = null
  if (Object.keys(patch).length === 0) return
  db.collection('assets').update(asset.id, patch)
  const movement = lastMovement(asset.id)
  if (movement?.action === 'correct' && 'installationPlace' in patch)
    db.collection('asset_movements').update(movement.id, {
      toInstallationPlace: patch.installationPlace ?? null,
    })
})
