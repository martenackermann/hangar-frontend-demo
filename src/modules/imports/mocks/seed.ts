import type { ImportJobStatus, ImportType } from '@/lib/api/types'
import { addDays } from '@/lib/format'
import type { SeedDefinition } from '@/mocks/db'
import type { BackgroundJobRow } from '@/mocks/jobs'
import { emptyPostProcess, type ImportJobErrorRow, type ImportJobRow } from './tables'

/**
 * H2 demo tables (SPEC §11.7). The backend export carries `import_jobs` / `import_job_errors`
 * (exporter of the h2 slice); until `seed.json` is regenerated from the merged backend, this
 * seed writes the same story: seven imports by Dana, the T−1 service-request file with
 * 4 errors + 3 warnings, warnings on the asset files, one cancelled delivery.
 */
const DANA_EMAIL = 'dana.dispatcher@example.com'

interface StoryJob {
  type: ImportType
  daysAgo: number
  hour: number
  status: ImportJobStatus
  filename: (date: string) => string
  total: number
  created: number
  updated?: number
  skipped?: number
  options: ImportJobRow['options']
  post?: Record<string, number>
  issues?: Omit<ImportJobErrorRow, 'id' | 'importJobId' | 'createdAt' | 'updatedAt'>[]
}

const compact = (date: string) => date.replace(/-/g, '')

const STORY: StoryJob[] = [
  {
    type: 'service_requests',
    daysAgo: 9,
    hour: 8,
    status: 'completed',
    filename: (d) => `itsm_sr_export_${compact(d)}.csv`,
    total: 30,
    created: 30,
    options: { dryRun: false },
    post: { leaseReturnsLinked: 3, hardwareHold: 2, contactsCreated: 21, contactsUpdated: 9 },
  },
  {
    type: 'lease_returns',
    daysAgo: 8,
    hour: 9,
    status: 'completed',
    filename: (d) => `itsm_lease_export_${compact(d)}.csv`,
    total: 40,
    created: 35,
    updated: 5,
    options: { dryRun: false, markMissingAsProbablyClosed: true },
    post: { probablyClosed: 6, contactsCreated: 28, contactsUpdated: 7 },
  },
  {
    type: 'contacts',
    daysAgo: 7,
    hour: 10,
    status: 'completed',
    filename: (d) => `itsm_users_${compact(d)}.csv`,
    total: 30,
    created: 30,
    options: { dryRun: false },
    post: { contactsCreated: 30 },
  },
  {
    type: 'assets_new',
    daysAgo: 5,
    hour: 11,
    status: 'completed',
    filename: (d) => `initech_delivery_${compact(d)}.csv`,
    total: 60,
    created: 60,
    options: { dryRun: false },
    issues: [
      {
        rowNumber: 12,
        severity: 'warning',
        columnName: 'model',
        code: 'unknown_model',
        message: "Model 'KD-AERO15-X9' is not in the article catalogue; the asset has no article.",
        rawValue: 'KD-AERO15-X9',
        businessKey: 'KDQ7M2XW4R',
      },
      {
        rowNumber: 33,
        severity: 'warning',
        columnName: 'model',
        code: 'unknown_model',
        message: "Model 'LM-VIEW-49U' is not in the article catalogue; the asset has no article.",
        rawValue: 'LM-VIEW-49U',
        businessKey: 'LMH4T8ZC2N',
      },
    ],
  },
  {
    type: 'asset_status_sync',
    daysAgo: 4,
    hour: 8,
    status: 'completed',
    filename: (d) => `itsm_install_states_${compact(d)}.csv`,
    total: 20,
    created: 13,
    updated: 6,
    skipped: 1,
    options: { dryRun: false },
    issues: [
      {
        rowNumber: 21,
        severity: 'warning',
        columnName: 'install_state',
        code: 'unmapped_state',
        message: "Install state 'Retired' is not synchronised; the row was skipped.",
        rawValue: 'Retired',
        businessKey: 'KD9ZT24MNP',
      },
    ],
  },
  {
    type: 'service_requests',
    daysAgo: 1,
    hour: 9,
    status: 'completed_with_errors',
    filename: (d) => `itsm_sr_export_${compact(d)}.csv`,
    total: 25,
    created: 21,
    options: { dryRun: false },
    post: { contactsCreated: 9, contactsUpdated: 6 },
    issues: [
      {
        rowNumber: 2,
        severity: 'warning',
        columnName: 'email',
        code: 'email_missing',
        message: 'The contact has no email address; automatic mails cannot be sent.',
        rawValue: null,
        businessKey: 'SR0012401',
      },
      {
        rowNumber: 3,
        severity: 'error',
        columnName: 'sr_number',
        code: 'invalid_format',
        message: "'SR12AB' does not match the format of 'sr_number' (^SR[0-9]{7}$).",
        rawValue: 'SR12AB',
        businessKey: 'SR12AB',
      },
      {
        rowNumber: 4,
        severity: 'error',
        columnName: 'delivery_address.Zip',
        code: 'packed_missing_key',
        message: "Required key 'Zip' is missing.",
        rawValue: null,
        businessKey: 'SR0012403',
      },
      {
        rowNumber: 5,
        severity: 'error',
        columnName: 'order_details.Procurement type',
        code: 'packed_duplicate_key',
        message: "Key 'Procurement type' appears more than once.",
        rawValue: 'Replacement',
        businessKey: 'SR0012404',
      },
      {
        rowNumber: 6,
        severity: 'warning',
        columnName: 'order_details.New base device type',
        code: 'unknown_article',
        message: "Device type 'Laptop Ultra 15' is not in the article catalogue.",
        rawValue: 'Laptop Ultra 15',
        businessKey: 'SR0012405',
      },
      {
        rowNumber: 7,
        severity: 'warning',
        columnName: 'order_details.Color',
        code: 'packed_unknown_key',
        message: "Unknown key 'Color' was ignored.",
        rawValue: 'Blue',
        businessKey: 'SR0012406',
      },
      {
        rowNumber: 26,
        severity: 'error',
        columnName: 'sr_number',
        code: 'duplicate_in_file',
        message: 'SR0012401 appears more than once in this file; only the first row is imported.',
        rawValue: 'SR0012401',
        businessKey: 'SR0012401',
      },
    ],
  },
  {
    type: 'assets_new',
    daysAgo: 1,
    hour: 14,
    status: 'cancelled',
    filename: (d) => `initech_delivery_${compact(d)}.csv`,
    total: 60,
    created: 0,
    options: { dryRun: false },
  },
]

function stamp(day: string, hour: number, minute: number, seconds = 0): string {
  return `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.000Z`
}

export const seed: SeedDefinition = {
  module: 'imports',
  version: 1,
  order: 20,
  run: ({ db, today, fixture }) => {
    // The backend export brought them: the loader has already inserted (and date-shifted)
    // every fixture table, import_jobs and import_job_errors included.
    if ((fixture.tables.import_jobs?.length ?? 0) > 0) return
    const dana = db.collection('users').find((u) => u.email === DANA_EMAIL)
    const goodsIn = (code: string) =>
      db.collection('stock_locations').find((l) => l.code === code)?.id
    const jobs = db.collection('background_jobs')
    let errorId = 1
    STORY.forEach((story, index) => {
      const day = addDays(today, -story.daysAgo)
      const createdAt = stamp(day, story.hour - 2, 12)
      const cancelled = story.status === 'cancelled'
      const finishedAt = stamp(day, story.hour - 2, cancelled ? 12 : 13, 30)
      const issues = cancelled ? [] : (story.issues ?? [])
      const errors = new Set(issues.filter((i) => i.severity === 'error').map((i) => i.rowNumber))
      const warnings = new Set(
        issues.filter((i) => i.severity === 'warning').map((i) => i.rowNumber),
      )
      const processed = cancelled ? 0 : story.total
      const id = index + 1
      const counts = {
        total: story.total,
        processed,
        created: story.created,
        updated: story.updated ?? 0,
        unchanged: 0,
        skipped: story.skipped ?? 0,
        errors: errors.size,
        warnings: warnings.size,
      }
      const job: BackgroundJobRow = jobs.insert({
        kind: 'import',
        status: cancelled ? 'cancelled' : 'succeeded',
        progressProcessed: processed,
        progressTotal: story.total,
        message: cancelled ? 'Cancelled' : `Import ${story.status}`,
        result: { kind: 'import', importJobId: id, status: story.status, counts },
        error: null,
        cancelRequested: cancelled,
        entityType: 'import_job',
        entityId: id,
        entityLabel: `import job #${id}`,
        createdBy: dana?.id ?? null,
        createdAt,
        startedAt: cancelled ? null : createdAt,
        finishedAt,
        durationMs: 0,
      })
      const targetLocationId =
        story.type === 'assets_new'
          ? goodsIn(cancelled ? 'EAS-GOODS_IN' : 'RIV-GOODS_IN')
          : undefined
      db.collection('import_jobs').insert({
        id,
        backgroundJobId: job.id,
        type: story.type,
        typeDetected: true,
        status: story.status,
        fileId: 0,
        originalFilename: story.filename(day),
        options: { ...story.options, ...(targetLocationId ? { targetLocationId } : {}) },
        totalRows: story.total,
        processedRows: processed,
        createdCount: counts.created,
        updatedCount: counts.updated,
        unchangedCount: 0,
        skippedCount: counts.skipped,
        errorCount: counts.errors,
        warningCount: counts.warnings,
        postProcess: { ...emptyPostProcess(), ...(cancelled ? {} : (story.post ?? {})) },
        jobWarnings: [],
        cancelRequested: cancelled,
        errorReportFileId: null,
        failure: null,
        createdBy: dana?.id ?? 1,
        startedAt: cancelled ? null : createdAt,
        finishedAt,
        createdAt,
        updatedAt: finishedAt,
      })
      for (const item of issues) {
        db.collection('import_job_errors').insert({
          ...item,
          id: errorId++,
          importJobId: id,
          createdAt: finishedAt,
          updatedAt: finishedAt,
        })
      }
    })
  },
}
