import { http, HttpResponse, type RequestHandler } from 'msw'
import type {
  ImportDetection,
  ImportGenerateSampleBody,
  ImportOptions,
  ImportType,
  JobAccepted,
} from '@/lib/api/types'
import { authed } from '@/mocks/auth'
import { db } from '@/mocks/db'
import { csv, downloadLink, storeFile } from '@/mocks/files'
import { apiPath, listOf, problem, problems, readJson } from '@/mocks/http'
import { startJob } from '@/mocks/jobs'
import { filterFrom, filterIn, filterTo, listResponse } from '@/mocks/list'
import { detectType, headerAnalysis, IMPORT_TYPES, importTemplates, SPECS } from './engine/formats'
import { FileProblem, readUpload, type RawTable } from './engine/reader'
import { runValidation } from './engine/run'
import { buildSample } from './engine/samples'
import { errorReportRows, validateTable } from './engine/validate'
import { importDetail, importSummary, syncImport } from './read-models'
import { emptyPostProcess } from './tables'

/** `/imports` (API.md §5.1): upload, detect, history, detail, issues, cancel, downloads. */
const MAX_BYTES = 20 * 1024 * 1024
const MAX_ROWS = 50_000
const nowIso = () => new Date().toISOString()

function fileProblem(error: FileProblem, request: Request) {
  return problem(error.status, error.code, 'File rejected', {
    detail: error.message,
    errors: { file: [error.message] },
    request,
  })
}

async function readFormFile(
  request: Request,
): Promise<
  { form: FormData; file: File; name: string; displayName: string; bytes: Uint8Array } | Response
> {
  const form = await request.formData()
  const file = form.get('file')
  // duck-typed: the browser, MSW and jsdom may each bring their own File class
  if (file === null || typeof file === 'string') {
    return problems.validation({ file: ['Choose a file.'] }, undefined, request)
  }
  // jsdom (Vitest) drops multipart file names ("blob"); treat a nameless part as CSV there
  const displayName = file.name && file.name !== 'blob' ? file.name : 'upload.csv'
  const name = displayName.toLowerCase()
  if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) {
    return problem(415, 'unsupported_media_type', 'Unsupported media type', {
      detail: `Unsupported file type '${name.includes('.') ? name.split('.').pop() : 'none'}'. Allowed: .csv, .xlsx.`,
      request,
    })
  }
  if (file.size > MAX_BYTES) {
    return problem(413, 'too_large', 'File too large', {
      detail: 'The file is larger than 20 MB.',
      request,
    })
  }
  if (file.size === 0) {
    return problem(400, 'empty_file', 'File rejected', { detail: 'The file is empty.', request })
  }
  return { form, file, name, displayName, bytes: new Uint8Array(await file.arrayBuffer()) }
}

const OPTION_KEYS = ['dryRun', 'targetLocationId', 'markMissingAsProbablyClosed']

function parseOptions(
  raw: FormDataEntryValue | null,
): { ok: true; options: ImportOptions } | { ok: false; errors: Record<string, string[]> } {
  if (raw === null || raw === '') return { ok: true, options: {} }
  let value: unknown
  try {
    value = JSON.parse(String(raw))
  } catch {
    return { ok: false, errors: { options: ['Options must be a JSON object.'] } }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, errors: { options: ['Options must be a JSON object.'] } }
  }
  const errors: Record<string, string[]> = {}
  for (const [key, v] of Object.entries(value)) {
    if (!OPTION_KEYS.includes(key)) errors[`options.${key}`] = ['Unknown field.']
    else if (key === 'targetLocationId' ? !Number.isInteger(v) : typeof v !== 'boolean') {
      errors[`options.${key}`] = [
        key === 'targetLocationId' ? 'Input should be a valid integer' : 'Input should be a valid boolean',
      ]
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, options: value as ImportOptions }
}

function importJob(id: number, request: Request) {
  const row = db.collection('import_jobs').get(id)
  return row ? syncImport(row) : problems.notFound('Import', id, request)
}

function detection(table: RawTable): ImportDetection {
  const detected = detectType(table.normalized)
  const analysis = detected
    ? headerAnalysis(table.normalized, SPECS[detected])
    : { missing: [], extra: [] }
  return {
    detectedType: detected,
    delimiter: table.delimiter,
    headers: table.headers,
    normalizedHeaders: table.normalized,
    missingColumns: analysis.missing,
    extraColumns: analysis.extra,
    rowCount: table.rows.length,
    preview: table.rows.slice(0, 5).map((row) => row.cells),
    problems: detected
      ? []
      : [
          {
            code: 'type_not_detected',
            message: 'The import type could not be detected from the column headers.',
          },
        ],
  }
}

export const importHandlers: RequestHandler[] = [
  http.post(
    apiPath('/imports/detect'),
    authed('imports.create', async ({ request }) => {
      const read = await readFormFile(request)
      if (read instanceof Response) return read
      try {
        return HttpResponse.json(detection(readUpload(read.name, read.bytes, MAX_ROWS)))
      } catch (error) {
        if (!(error instanceof FileProblem)) throw error
        const body: ImportDetection = {
          detectedType: null,
          delimiter: null,
          headers: [],
          normalizedHeaders: [],
          missingColumns: [],
          extraColumns: [],
          rowCount: 0,
          preview: [],
          problems: [{ code: error.code, message: error.message }],
        }
        return HttpResponse.json(body)
      }
    }),
  ),
  http.post(
    apiPath('/imports'),
    authed('imports.create', async ({ request, actor }) => {
      const read = await readFormFile(request)
      if (read instanceof Response) return read
      let table: RawTable
      try {
        table = readUpload(read.name, read.bytes, MAX_ROWS)
      } catch (error) {
        if (error instanceof FileProblem) return fileProblem(error, request)
        throw error
      }
      const parsed = parseOptions(read.form.get('options'))
      if (!parsed.ok) return problems.validation(parsed.errors, undefined, request)
      const options = parsed.options
      const forcedRaw = read.form.get('type')
      const forced = typeof forcedRaw === 'string' && forcedRaw ? (forcedRaw as ImportType) : null
      if (forced && !IMPORT_TYPES.includes(forced)) {
        return problems.validation({ type: [`Unknown value '${forced}'.`] }, undefined, request)
      }
      const type = forced ?? detectType(table.normalized)
      if (!type) {
        const message = 'The import type could not be detected from the column headers.'
        return problem(422, 'type_not_detected', 'Type not detected', {
          detail: message,
          errors: { file: [message] },
          request,
        })
      }
      const { missing, extra } = headerAnalysis(table.normalized, SPECS[type])
      if (missing.length) {
        return problem(422, 'missing_columns', 'Missing columns', {
          detail: `Missing columns: ${missing.join(', ')}.`,
          errors: { file: [`Missing columns: ${missing.join(', ')}`] },
          request,
        })
      }
      const stored: ImportOptions = { dryRun: Boolean(options.dryRun) }
      if (type === 'assets_new') {
        const location = options.targetLocationId
          ? db.collection('stock_locations').get(options.targetLocationId)
          : undefined
        const site = location?.siteId ? db.collection('sites').get(location.siteId) : undefined
        if (!location || !['goods_in', 'staging'].includes(location.type) || site?.kind !== 'hub') {
          return problems.validation(
            {
              'options.targetLocationId': [
                options.targetLocationId
                  ? 'Choose an active hub location of type goods in or staging.'
                  : 'Choose the hub location the devices are received into.',
              ],
            },
            undefined,
            request,
          )
        }
        stored.targetLocationId = location.id
      }
      if (type === 'lease_returns') {
        stored.markMissingAsProbablyClosed = Boolean(options.markMissingAsProbablyClosed)
      }

      const id = db.collection('import_jobs').nextId()
      const file = storeFile({
        filename: read.displayName,
        contentType: 'text/csv',
        body: read.bytes,
        purpose: 'import_upload',
        entity: { type: 'import_job', id },
        actorId: actor.id,
        ttlHours: null,
      })
      const total = table.rows.length
      const accepted: JobAccepted = startJob({
        kind: 'import',
        actor,
        entity: { type: 'import_job', id, label: `Import #${id}` },
        total,
        durationMs: Math.min(8000, 1200 + total * 25),
        message: 'Reading file',
        run: () => {
          const current = db.collection('import_jobs').get(id)!
          const validation = validateTable(table, type)
          const result = runValidation(id, type, stored, validation, actor)
          const finished = nowIso()
          for (const row of validation.rows) {
            for (const issue of row.issues) {
              db.collection('import_job_errors').insert({
                importJobId: id,
                rowNumber: row.number,
                severity: issue.severity,
                columnName: issue.column,
                code: issue.code,
                message: issue.message,
                rawValue: issue.rawValue,
                businessKey: row.key ? row.key.slice(0, 40) : null,
                createdAt: finished,
                updatedAt: finished,
              })
            }
          }
          const reportRows = errorReportRows(validation)
          const report = reportRows
            ? storeFile({
                filename: `import-${id}-issues.csv`,
                contentType: 'text/csv',
                body: csv(reportRows),
                purpose: 'import_error_report',
                entity: { type: 'import_job', id },
                actorId: actor.id,
                ttlHours: null,
              })
            : null
          db.collection('import_jobs').update(id, {
            status: current.cancelRequested ? 'cancelled' : result.status,
            processedRows: result.counts.processed,
            createdCount: result.counts.created,
            updatedCount: result.counts.updated,
            unchangedCount: result.counts.unchanged,
            skippedCount: result.counts.skipped,
            errorCount: result.counts.errors,
            warningCount: result.counts.warnings,
            postProcess: result.postProcess,
            errorReportFileId: report?.id ?? null,
            failure: result.failure,
            startedAt: current.startedAt ?? finished,
            finishedAt: finished,
            updatedAt: finished,
          })
          return {
            kind: 'import',
            importJobId: id,
            status: result.status,
            counts: { total, ...result.counts },
          }
        },
      })
      const now = nowIso()
      db.collection('import_jobs').insert({
        id,
        backgroundJobId: accepted.jobId,
        type,
        typeDetected: !forced,
        status: 'queued',
        fileId: file.id,
        originalFilename: read.displayName,
        options: stored,
        totalRows: total,
        processedRows: 0,
        createdCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        warningCount: 0,
        postProcess: emptyPostProcess(),
        jobWarnings: extra.length
          ? [{ code: 'extra_columns', message: `Ignored columns: ${extra.join(', ')}.` }]
          : [],
        cancelRequested: false,
        errorReportFileId: null,
        failure: null,
        createdBy: actor.id,
        startedAt: null,
        finishedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      return HttpResponse.json({ ...accepted, importJobId: id }, { status: 202 })
    }),
  ),
  http.get(
    apiPath('/imports'),
    authed('imports.read', ({ request, actor }) =>
      listResponse(db.collection('import_jobs').all().map(syncImport), request, {
        sortable: { createdAt: (r) => r.createdAt, finishedAt: (r) => r.finishedAt },
        defaultSort: '-createdAt',
        filters: {
          type: filterIn((r) => r.type),
          status: filterIn((r) => r.status),
          createdById: filterIn((r) => r.createdBy),
          from: filterFrom((r) => r.createdAt),
          to: filterTo((r) => r.createdAt),
        },
        map: (r) => importSummary(r, actor),
      }),
    ),
  ),
  http.get(
    apiPath('/imports/templates'),
    authed('imports.read', () => listOf(importTemplates())),
  ),
  http.get(
    apiPath('/imports/templates/:type/sample'),
    authed<{ type: string }>('imports.read', ({ params, request, actor }) => {
      const type = params.type as ImportType
      if (!IMPORT_TYPES.includes(type)) {
        return problems.validation({ type: [`Unknown value '${type}'.`] }, undefined, request)
      }
      const file = storeFile({
        filename: `${type}.csv`,
        contentType: 'text/csv',
        body: buildSample(type),
        purpose: 'sample',
        actorId: actor.id,
      })
      return HttpResponse.json(downloadLink(file))
    }),
  ),
  http.post(
    apiPath('/imports/generate-sample'),
    authed('imports.create', async ({ request, actor }) => {
      const body = await readJson<ImportGenerateSampleBody>(request)
      const errors: Record<string, string[]> = {}
      if (!body.type || !IMPORT_TYPES.includes(body.type)) errors.type = ['Choose an import type.']
      if (typeof body.rows !== 'number' || body.rows < 1 || body.rows > 500) {
        errors.rows = ['Input should be between 1 and 500']
      }
      if (Object.keys(errors).length || !body.type) {
        return problems.validation(errors, undefined, request)
      }
      const file = storeFile({
        filename: `itsm-export-${body.type}.csv`,
        contentType: 'text/csv',
        body: buildSample(body.type, {
          rows: body.rows,
          seed: Date.now() % 1_000_000,
          withErrors: Boolean(body.withErrors),
        }),
        purpose: 'sample',
        actorId: actor.id,
      })
      return HttpResponse.json(downloadLink(file))
    }),
  ),
  http.get(
    apiPath('/imports/:id'),
    authed<{ id: string }>('imports.read', ({ params, request, actor }) => {
      const row = importJob(Number(params.id), request)
      return row instanceof Response ? row : HttpResponse.json(importDetail(row, actor))
    }),
  ),
  http.get(
    apiPath('/imports/:id/errors'),
    authed<{ id: string }>('imports.read', ({ params, request }) => {
      const row = importJob(Number(params.id), request)
      if (row instanceof Response) return row
      const severity = new URL(request.url).searchParams.get('severity')
      return listResponse(
        db
          .collection('import_job_errors')
          .filter((e) => e.importJobId === row.id && (!severity || e.severity === severity)),
        request,
        {
          sortable: { rowNumber: (e) => e.rowNumber },
          defaultSort: 'rowNumber',
          filters: { code: filterIn((e) => e.code) },
          map: (e) => ({
            id: e.id,
            rowNumber: e.rowNumber,
            severity: e.severity,
            columnName: e.columnName,
            code: e.code,
            message: e.message,
            rawValue: e.rawValue,
            businessKey: e.businessKey,
          }),
        },
      )
    }),
  ),
  http.post(
    apiPath('/imports/:id/actions/cancel'),
    authed<{ id: string }>('imports.create', ({ params, request, actor }) => {
      const row = importJob(Number(params.id), request)
      if (row instanceof Response) return row
      if (row.status !== 'queued' && row.status !== 'processing') {
        return problem(409, 'transition_not_allowed', 'Action not possible', {
          detail: `Import #${row.id} is already '${row.status}'.`,
          allowedActions: [],
          request,
        })
      }
      db.collection('background_jobs').update(row.backgroundJobId, { cancelRequested: true })
      const updated =
        row.status === 'queued'
          ? db.collection('import_jobs').update(row.id, {
              status: 'cancelled',
              cancelRequested: true,
              finishedAt: nowIso(),
            })!
          : db.collection('import_jobs').update(row.id, { cancelRequested: true })!
      return HttpResponse.json(importDetail(updated, actor))
    }),
  ),
  http.get(
    apiPath('/imports/:id/file'),
    authed<{ id: string }>('imports.read', ({ params, request, actor }) => {
      const row = importJob(Number(params.id), request)
      if (row instanceof Response) return row
      const existing = db.collection('stored_files').get(row.fileId)
      if (existing?.contentBase64) return HttpResponse.json(downloadLink(existing))
      // seeded/exported history: the original bytes are not part of the demo database
      const file = storeFile({
        filename: row.originalFilename,
        contentType: 'text/csv',
        body: buildSample(row.type),
        purpose: 'import_upload',
        entity: { type: 'import_job', id: row.id },
        actorId: actor.id,
      })
      return HttpResponse.json(downloadLink(file))
    }),
  ),
  http.get(
    apiPath('/imports/:id/error-report'),
    authed<{ id: string }>('imports.read', ({ params, request, actor }) => {
      const row = importJob(Number(params.id), request)
      if (row instanceof Response) return row
      const existing = row.errorReportFileId
        ? db.collection('stored_files').get(row.errorReportFileId)
        : undefined
      if (existing?.contentBase64) return HttpResponse.json(downloadLink(existing))
      const errors = db.collection('import_job_errors').filter((e) => e.importJobId === row.id)
      if (errors.length === 0) return problems.notFound('Error report of import', row.id, request)
      const file = storeFile({
        filename: `import-${row.id}-issues.csv`,
        contentType: 'text/csv',
        body: csv([
          ['business_key', 'value', 'row_number', 'severity', 'column', 'code', 'message'],
          ...errors.map((e) => [
            e.businessKey,
            e.rawValue,
            e.rowNumber,
            e.severity,
            e.columnName,
            e.code,
            e.message,
          ]),
        ]),
        purpose: 'import_error_report',
        entity: { type: 'import_job', id: row.id },
        actorId: actor.id,
      })
      return HttpResponse.json(downloadLink(file))
    }),
  ),
]
