import type { ImportJobStatus, ImportType } from '@/lib/api/types'

/**
 * H2 tables in the demo database (SPEC §5.3), same raw camelCase rows as the backend export
 * (`import_jobs`, `import_job_errors`; SPEC_RESOLUTIONS #16).
 */
export interface ImportJobRow {
  id: number
  backgroundJobId: number
  type: ImportType
  typeDetected: boolean
  status: ImportJobStatus
  fileId: number
  originalFilename: string
  options: { dryRun?: boolean; targetLocationId?: number; markMissingAsProbablyClosed?: boolean }
  totalRows: number | null
  processedRows: number
  createdCount: number
  updatedCount: number
  unchangedCount: number
  skippedCount: number
  errorCount: number
  warningCount: number
  postProcess: Record<string, number>
  /** Backend extra column (API `jobLevelWarnings`). */
  jobWarnings: { code: string; message: string }[]
  cancelRequested: boolean
  errorReportFileId: number | null
  /** Backend extra column: reason of status `failed`. */
  failure: string | null
  createdBy: number
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ImportJobErrorRow {
  id: number
  importJobId: number
  rowNumber: number
  severity: 'error' | 'warning'
  columnName: string | null
  code: string
  message: string
  rawValue: string | null
  businessKey: string | null
  createdAt: string
  updatedAt: string
}

declare module '@/mocks/db' {
  interface DemoCollections {
    import_jobs: ImportJobRow
    import_job_errors: ImportJobErrorRow
  }
}

export const POST_PROCESS_KEYS = [
  'leaseReturnsLinked',
  'hardwareHold',
  'cancelledByItsm',
  'probablyClosed',
  'reopened',
  'contactsCreated',
  'contactsUpdated',
] as const

export function emptyPostProcess(): Record<string, number> {
  return Object.fromEntries(POST_PROCESS_KEYS.map((key) => [key, 0]))
}
