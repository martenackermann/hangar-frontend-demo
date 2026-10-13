import type { DeactivationReason, DeactivationResult } from '@/lib/api/types'
import type { MockActor } from '@/mocks/auth'
import { db } from '@/mocks/db'
import { userRef } from '@/mocks/core/read-models'
import { applyAction } from '@/mocks/workflow'
import { moveAsset, locationOf } from '@/mocks/core/workflow'
import { csv, downloadLink, storeFile } from '@/mocks/files'
import { DEACTIVATED, label, locationMap, normalizeSerial } from './common'
import type { DeactivationBatchRow, DeactivationSampleRow } from './tables'

/** Deactivation upload (SPEC §6.10; #23, #24) — port of `services/deactivation.py`. */

export const MAX_ROWS = 10_000
const WORKFLOW = new Set(['assigned', 'prepared', 'provided'])
const DEACTIVATABLE = new Set(['available', 'in_use', 'collected', 'missing'])
const REASON_STATUS: Record<
  DeactivationReason,
  'deactivated_returned' | 'deactivated_bought_out' | 'deactivated_disposed'
> = {
  returned_to_lessor: 'deactivated_returned',
  bought_out: 'deactivated_bought_out',
  disposed: 'deactivated_disposed',
}
const REASON_TEXT: Record<DeactivationReason, string> = {
  returned_to_lessor: 'Returned to lessor',
  bought_out: 'Bought out',
  disposed: 'Disposed',
}

type UploadCode =
  'missing_columns' | 'empty_file' | 'duplicate_columns' | 'too_many_rows' | 'invalid_file'

export class UploadProblem extends Error {
  readonly status: number
  readonly code: UploadCode
  constructor(status: number, code: UploadCode, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (char === '"') quoted = false
      else current += char
    } else if (char === '"') quoted = true
    else if (char === delimiter) {
      out.push(current)
      current = ''
    } else current += char
  }
  out.push(current)
  return out
}

export interface ParsedRow {
  serial: string | null
  tag: string | null
}

const BOM = String.fromCharCode(0xfeff)

export function parseCsv(text: string): ParsedRow[] {
  const lines = (text.startsWith(BOM) ? text.slice(1) : text)
    .split(/\r?\n/)
    .filter((line) => line.trim())
  if (lines.length === 0) throw new UploadProblem(400, 'empty_file', 'The file is empty.')
  const first = lines[0] ?? ''
  const delimiter = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ','
  const header = splitCsvLine(first, delimiter).map((h) =>
    h.trim().toLowerCase().replaceAll(' ', '_').replaceAll('-', '_'),
  )
  const duplicates = header.filter((h, i) => h && header.indexOf(h) !== i)
  if (duplicates.length)
    throw new UploadProblem(
      400,
      'duplicate_columns',
      `Duplicate columns: ${[...new Set(duplicates)].join(', ')}.`,
    )
  const serialIndex = header.indexOf('serial_number')
  if (serialIndex < 0)
    throw new UploadProblem(422, 'missing_columns', "The file needs a 'serial_number' column.")
  const tagIndex = header.indexOf('asset_tag')
  const rows = lines
    .slice(1)
    .map((line) => splitCsvLine(line, delimiter))
    .filter((r) => r.some((c) => c.trim()))
  if (rows.length === 0) throw new UploadProblem(400, 'empty_file', 'The file has no data rows.')
  if (rows.length > MAX_ROWS)
    throw new UploadProblem(
      413,
      'too_many_rows',
      `The file has ${rows.length} rows; at most ${MAX_ROWS} are allowed.`,
    )
  const seen = new Set<string>()
  const parsed: ParsedRow[] = []
  for (const row of rows) {
    const serial = normalizeSerial(row[serialIndex])
    const tag = tagIndex >= 0 ? normalizeSerial(row[tagIndex]) : null
    const key = serial ?? tag
    if (!key || seen.has(key)) continue
    seen.add(key)
    parsed.push({ serial, tag })
  }
  if (parsed.length === 0)
    throw new UploadProblem(400, 'empty_file', 'The file contains no serial numbers.')
  return parsed
}

interface Outcome extends DeactivationSampleRow {
  assetId: number | null
}

export function deactivate(
  rows: ParsedRow[],
  reason: DeactivationReason,
  filename: string,
  body: string,
  actor: MockActor,
): DeactivationBatchRow {
  const assets = db.collection('assets')
  const bySerial = new Map(assets.all().map((a) => [a.serialNumber, a]))
  const byTag = new Map(
    assets
      .all()
      .filter((a) => a.assetTag)
      .map((a) => [a.assetTag!, a]),
  )
  const upload = storeFile({
    filename,
    contentType: 'text/csv',
    body,
    purpose: 'deactivation_upload',
    actorId: actor.id,
    ttlHours: null,
  })
  const batch = db.collection('deactivation_batches').insert({
    reason,
    originalFilename: filename,
    fileId: upload.id,
    totalRows: rows.length,
    deactivatedCount: 0,
    alreadyDeactivatedCount: 0,
    rejectedCount: 0,
    notFoundCount: 0,
    closedLeaseReturnCount: 0,
    notFoundFileId: null,
    rejectedFileId: null,
    sample: null,
    createdBy: actor.id,
    createdAt: new Date().toISOString(),
  })
  const locations = locationMap()
  const offFleet = locationOf(null, 'off_fleet')
  const outcomes: Outcome[] = []
  const tags: string[] = []
  for (const row of rows) {
    const asset =
      (row.serial ? bySerial.get(row.serial) : undefined) ??
      (row.tag ? byTag.get(row.tag) : undefined)
    const key = asset?.serialNumber ?? row.serial ?? row.tag ?? ''
    if (!asset) {
      outcomes.push({
        serialNumber: key,
        outcome: 'not_found',
        detail: 'Not in the asset records.',
        assetId: null,
      })
      continue
    }
    if (DEACTIVATED.has(asset.status)) {
      outcomes.push({
        serialNumber: key,
        outcome: 'already_deactivated',
        detail: label('assetStatus', asset.status),
        assetId: asset.id,
      })
      continue
    }
    if (WORKFLOW.has(asset.status) || !DEACTIVATABLE.has(asset.status)) {
      const sr = asset.serviceRequestId
        ? db.collection('service_requests').get(asset.serviceRequestId)
        : undefined
      outcomes.push({
        serialNumber: key,
        outcome: 'rejected',
        detail: sr
          ? `${label('assetStatus', asset.status)} for ${sr.number}`
          : label('assetStatus', asset.status),
        assetId: asset.id,
      })
      continue
    }
    const before = `was ${label('assetStatus', asset.status)} at ${locations.get(asset.locationId)?.name ?? '?'}`
    moveAsset(asset.id, 'deactivate', {
      toStatus: REASON_STATUS[reason],
      toLocationId: offFleet,
      installationPlace: null,
      serviceRequestId: null,
      actor,
      trigger: 'user',
      sourceRef: `deactivation:${batch.id}`,
    })
    outcomes.push({
      serialNumber: key,
      outcome: 'deactivated',
      detail: `${REASON_TEXT[reason]} · ${before}`,
      assetId: asset.id,
    })
    if (asset.assetTag) tags.push(asset.assetTag)
  }
  let closed = 0
  const tagSet = new Set(tags)
  for (const lease of db
    .collection('lease_returns')
    .filter((l) => tagSet.has(l.assetTag) && l.status !== 'closed')) {
    const result = applyAction('leaseReturn', lease.id, 'close', {
      actor,
      trigger: 'system',
      payload: {
        comment: 'device_deactivated',
        closeReason: 'device_deactivated',
        deactivationBatchId: batch.id,
      },
    })
    if (result.ok) closed++
  }
  const count = (outcome: Outcome['outcome']) => outcomes.filter((o) => o.outcome === outcome)
  const notFound = count('not_found')
  const rejected = count('rejected')
  const notFoundFile = notFound.length
    ? storeFile({
        filename: `deactivation-${batch.id}-not-found.csv`,
        contentType: 'text/csv',
        body: csv([['serial_number'], ...notFound.map((o) => [o.serialNumber])]),
        purpose: 'deactivation_report',
        actorId: actor.id,
        ttlHours: null,
      })
    : null
  const rejectedFile = rejected.length
    ? storeFile({
        filename: `deactivation-${batch.id}-rejected.csv`,
        contentType: 'text/csv',
        body: csv([
          ['serial_number', 'status', 'service_request', 'reason'],
          ...rejected.map((o) => {
            const asset = o.assetId ? assets.get(o.assetId) : undefined
            const sr = asset?.serviceRequestId
              ? db.collection('service_requests').get(asset.serviceRequestId)
              : undefined
            return [
              o.serialNumber,
              asset?.status,
              sr?.number,
              'Device is in a service request workflow; finish or release it first.',
            ]
          }),
        ]),
        purpose: 'deactivation_report',
        actorId: actor.id,
        ttlHours: null,
      })
    : null
  return db.collection('deactivation_batches').update(batch.id, {
    deactivatedCount: count('deactivated').length,
    alreadyDeactivatedCount: count('already_deactivated').length,
    rejectedCount: rejected.length,
    notFoundCount: notFound.length,
    closedLeaseReturnCount: closed,
    notFoundFileId: notFoundFile?.id ?? null,
    rejectedFileId: rejectedFile?.id ?? null,
    sample: outcomes
      .slice(0, 50)
      .map(({ serialNumber, outcome, detail }) => ({ serialNumber, outcome, detail })),
  })!
}

export function batchOut(batch: DeactivationBatchRow) {
  return {
    id: batch.id,
    reason: batch.reason,
    originalFilename: batch.originalFilename,
    totalRows: batch.totalRows,
    deactivatedCount: batch.deactivatedCount,
    alreadyDeactivatedCount: batch.alreadyDeactivatedCount,
    rejectedCount: batch.rejectedCount,
    notFoundCount: batch.notFoundCount,
    createdBy: userRef(batch.createdBy)!,
    createdAt: batch.createdAt,
  }
}

/** A report link: the stored file, or (seeded batches without content) a regenerated CSV. */
function reportLink(batch: DeactivationBatchRow, kind: 'not_found' | 'rejected') {
  const fileId = kind === 'not_found' ? batch.notFoundFileId : batch.rejectedFileId
  if (!fileId) return null
  const file = db.collection('stored_files').get(fileId)
  if (file?.contentBase64) return downloadLink(file)
  const rows = (batch.sample ?? []).filter((s) => s.outcome === kind)
  const regenerated = storeFile({
    filename: file?.filename ?? `deactivation-${batch.id}-${kind.replace('_', '-')}.csv`,
    contentType: 'text/csv',
    body:
      kind === 'not_found'
        ? csv([['serial_number'], ...rows.map((r) => [r.serialNumber])])
        : csv([
            ['serial_number', 'status', 'service_request', 'reason'],
            ...rows.map((r) => [r.serialNumber, '', '', r.detail]),
          ]),
    purpose: 'deactivation_report',
    ttlHours: null,
  })
  db.collection('deactivation_batches').update(
    batch.id,
    kind === 'not_found' ? { notFoundFileId: regenerated.id } : { rejectedFileId: regenerated.id },
  )
  return downloadLink(regenerated)
}

export function resultOut(batch: DeactivationBatchRow): DeactivationResult {
  return {
    ...batchOut(batch),
    notFoundReport: reportLink(batch, 'not_found'),
    rejectedReport: reportLink(batch, 'rejected'),
    closedLeaseReturns: batch.closedLeaseReturnCount,
    sample: batch.sample ?? [],
  }
}

export function sampleCsv(): string {
  const collected = db
    .collection('assets')
    .filter((a) => a.status === 'collected')
    .sort((a, b) => a.statusChangedAt.localeCompare(b.statusChangedAt) || a.id - b.id)
    .slice(0, 5)
  return csv([
    ['serial_number', 'asset_tag'],
    ...collected.map((a) => [a.serialNumber, a.assetTag ?? '']),
    ['KD0NOTFOUND', ''],
  ])
}

export { REASON_STATUS }
