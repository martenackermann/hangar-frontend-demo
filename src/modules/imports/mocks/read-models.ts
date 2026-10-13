import type {
  Article,
  ArticleDetail,
  ArticleSiteSetting,
  ImportCounts,
  ImportJobDetail,
  ImportJobSummary,
  RegionDetail,
  RegionRule,
  VipEntry,
} from '@/lib/api/types'
import type { MockActor } from '@/mocks/auth'
import type { ArticleRow, ArticleSiteSettingRow, RegionRuleRow, VipEntryRow } from '@/mocks/core/tables'
import {
  contactRef,
  locationRef,
  region as regionDto,
  regionRef,
  siteRef,
  SR_TERMINAL,
  userRef,
} from '@/mocks/core/read-models'
import { db } from '@/mocks/db'
import { advanceJob } from '@/mocks/jobs'
import { emptyPostProcess, type ImportJobRow } from './tables'

/** Response shapes of the H2 endpoints (API.md §5), built from the demo tables. */

const ACTIVE = new Set(['queued', 'processing'])
const TERMINAL = new Set(['completed', 'completed_with_errors', 'failed', 'cancelled'])

/** Bring an import row up to date with its background job (queued → processing → done). */
export function syncImport(row: ImportJobRow): ImportJobRow {
  if (TERMINAL.has(row.status)) return row
  const job = advanceJob(row.backgroundJobId)
  const current = db.collection('import_jobs').get(row.id) ?? row
  if (TERMINAL.has(current.status) || !job) return current
  if (job.status === 'cancelled') {
    return db.collection('import_jobs').update(row.id, {
      status: 'cancelled',
      finishedAt: job.finishedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })!
  }
  if (job.status === 'running' && current.status === 'queued') {
    return db.collection('import_jobs').update(row.id, {
      status: 'processing',
      startedAt: job.startedAt ?? new Date().toISOString(),
      processedRows: job.progressProcessed,
    })!
  }
  if (job.status === 'running') {
    return db.collection('import_jobs').update(row.id, { processedRows: job.progressProcessed })!
  }
  return current
}

export function importCounts(row: ImportJobRow): ImportCounts {
  return {
    total: row.totalRows,
    processed: row.processedRows,
    created: row.createdCount,
    updated: row.updatedCount,
    unchanged: row.unchangedCount,
    skipped: row.skippedCount,
    errors: row.errorCount,
    warnings: row.warningCount,
  }
}

function progressPercent(row: ImportJobRow): number | null {
  if (row.status === 'completed' || row.status === 'completed_with_errors') return 100
  if (!row.totalRows) return ACTIVE.has(row.status) ? null : 0
  return Math.min(100, Math.round((row.processedRows * 100) / row.totalRows))
}

export function importSummary(row: ImportJobRow, actor: MockActor | null): ImportJobSummary {
  return {
    id: row.id,
    jobId: row.backgroundJobId,
    type: row.type,
    typeDetected: row.typeDetected,
    status: row.status,
    originalFilename: row.originalFilename,
    dryRun: Boolean(row.options.dryRun),
    counts: importCounts(row),
    progressPercent: progressPercent(row),
    createdBy: userRef(row.createdBy) ?? {
      id: row.createdBy,
      displayName: 'Unknown user',
      email: '',
      role: 'viewer',
    },
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    availableActions:
      ACTIVE.has(row.status) && !row.cancelRequested && actor?.permissions.includes('imports.create')
        ? ['cancel']
        : [],
  }
}

export function importDetail(row: ImportJobRow, actor: MockActor | null): ImportJobDetail {
  const errors = db.collection('import_job_errors').filter((e) => e.importJobId === row.id)
  const top = new Map<string, { code: string; severity: 'error' | 'warning'; count: number }>()
  for (const e of errors) {
    const key = `${e.code}|${e.severity}`
    const entry = top.get(key) ?? { code: e.code, severity: e.severity, count: 0 }
    entry.count++
    top.set(key, entry)
  }
  const warnings = [...row.jobWarnings]
  if (row.failure) warnings.push({ code: 'import_failed', message: row.failure })
  return {
    ...importSummary(row, actor),
    options: {
      dryRun: Boolean(row.options.dryRun),
      targetLocationId: row.options.targetLocationId,
      markMissingAsProbablyClosed: Boolean(row.options.markMissingAsProbablyClosed),
      targetLocation: locationRef(row.options.targetLocationId ?? null),
    },
    postProcess: { ...emptyPostProcess(), ...row.postProcess } as ImportJobDetail['postProcess'],
    jobLevelWarnings: warnings,
    hasErrorReport: errors.length > 0,
    topErrorCodes: [...top.values()]
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
      .slice(0, 12),
  }
}

// ---- articles ---------------------------------------------------------------------------------

const DEMAND = new Set([
  'imported',
  'imported_vip',
  'invited',
  'campus_info_sent',
  'reminder_1_sent',
  'reminder_2_sent',
  'escalated',
  'appointment_booked',
  'personalization_in_progress',
  'personalization_done',
  'ready_for_picking',
])

export function articleCounts(): { assets: Map<number, number>; demand: Map<number, number> } {
  const assets = new Map<number, number>()
  for (const asset of db.collection('assets').all()) {
    if (asset.articleId === null || asset.status.startsWith('deactivated_')) continue
    assets.set(asset.articleId, (assets.get(asset.articleId) ?? 0) + 1)
  }
  const srs = db.collection('service_requests')
  const demand = new Map<number, number>()
  for (const item of db.collection('service_request_items').all()) {
    if (item.articleId === null || !item.slot.startsWith('new_')) continue
    const sr = srs.get(item.serviceRequestId)
    if (!sr) continue
    const counts =
      DEMAND.has(sr.status) || (sr.status === 'reschedule_needed' && sr.resumeStatus !== 'shipped')
    if (counts) demand.set(item.articleId, (demand.get(item.articleId) ?? 0) + 1)
  }
  return { assets, demand }
}

export function article(row: ArticleRow, counts = articleCounts()): Article {
  return {
    id: row.id,
    number: row.number,
    category: row.category,
    name: row.name,
    modelNumber: row.modelNumber,
    manufacturer: row.manufacturer,
    externalPartNumber: row.externalPartNumber,
    internalDescription: row.internalDescription,
    weightKg: Number(row.weightKg),
    isActive: row.isActive,
    assetCount: counts.assets.get(row.id) ?? 0,
    openDemand: counts.demand.get(row.id) ?? 0,
  }
}

export function siteSetting(row: ArticleSiteSettingRow): ArticleSiteSetting {
  return {
    site: siteRef(row.siteId)!,
    bufferQty: row.bufferQty,
    minQty: row.minQty,
    maxQty: row.maxQty,
    stockQty: row.stockQty,
    demandQty: row.demandQty,
    calculatedAt: row.calculatedAt,
    lastOrderDate: row.lastOrderDate,
    lastOrderedQty: row.lastOrderedQty,
  }
}

export function articleDetail(row: ArticleRow): ArticleDetail {
  const sites = new Map(db.collection('sites').all().map((s) => [s.id, s]))
  return {
    ...article(row),
    siteSettings: db
      .collection('article_site_settings')
      .filter((s) => s.articleId === row.id)
      .sort((a, b) => (sites.get(a.siteId)?.sortOrder ?? 0) - (sites.get(b.siteId)?.sortOrder ?? 0))
      .map(siteSetting),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ---- regions + rules --------------------------------------------------------------------------

export function rule(row: RegionRuleRow): RegionRule {
  return {
    id: row.id,
    regionId: row.regionId,
    matchKind: row.matchKind,
    pattern: row.pattern,
    procurementType: row.procurementType,
    deliveryType: row.deliveryType,
    isCampus: row.isCampus,
    priority: row.priority,
    isActive: row.isActive,
    note: row.note,
    normalizedPattern: row.pattern,
    region: regionRef(row.regionId)!,
    matchCount: db
      .collection('service_requests')
      .count((sr) => sr.regionRuleId === row.id && !SR_TERMINAL.has(sr.status)),
  }
}

export function regionDetail(id: number): RegionDetail | null {
  const base = regionDto(id)
  const row = db.collection('regions').get(id)
  if (!base || !row) return null
  return {
    ...base,
    rules: db
      .collection('region_rules')
      .filter((r) => r.regionId === id)
      .sort((a, b) => a.matchKind.localeCompare(b.matchKind) || a.pattern.localeCompare(b.pattern))
      .map(rule),
    bookingLinkExample:
      row.bookingDestinationId && row.bookingServiceId
        ? `https://booking.example.com/book/${row.bookingDestinationId}/${row.bookingServiceId}?ref=SR0012345`
        : null,
  }
}

// ---- VIP ---------------------------------------------------------------------------------------

export function vipEntry(row: VipEntryRow): VipEntry {
  const contact = db.collection('contacts').find((c) => c.userId === row.userId)
  return {
    id: row.id,
    userId: row.userId,
    firstName: row.firstName,
    lastName: row.lastName,
    vipType: row.vipType,
    title: row.title,
    note: row.note,
    contact: contact ? contactRef(contact) : null,
    openServiceRequests: contact
      ? db
          .collection('service_requests')
          .count((sr) => sr.contactId === contact.id && !SR_TERMINAL.has(sr.status))
      : 0,
    openLeaseReturns: db
      .collection('lease_returns')
      .count((l) => l.userId === row.userId && l.status !== 'closed'),
    createdAt: row.createdAt,
  }
}
