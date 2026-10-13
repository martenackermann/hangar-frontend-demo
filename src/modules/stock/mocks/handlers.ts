import { http, HttpResponse, type RequestHandler } from 'msw'
import type { ArticleCategory, AssetPatch, DeactivationReason } from '@/lib/api/types'
import { businessToday } from '@/lib/format'
import { authed } from '@/mocks/auth'
import { db } from '@/mocks/db'
import { assetDetail, assetListItem, assetMovement, movementsOf } from '@/mocks/core/read-models'
import { csv, downloadLink, storeFile } from '@/mocks/files'
import { apiPath, intParam, noContent, problem, problems, readJson } from '@/mocks/http'
import { advanceJob, startJob } from '@/mocks/jobs'
import {
  filterFrom,
  filterIn,
  filterTo,
  listResponse,
  multiValue,
  paginate,
  parsePage,
  queryRows,
} from '@/mocks/list'
import { ASSET_SEARCH, assetFilters, assetRows, assetSortable, exportAssetsCsv } from './assets'
import {
  detail,
  lineFromSetting,
  linesOf,
  nextNumber,
  sendFailure,
  settingsOf,
  storeDocuments,
  summary,
  TEAM_MAILBOX,
} from './calloff'
import { blankToNull, compact, label, normalizeSerial } from './common'
import { dashboardKpis } from './dashboard'
import { batchOut, deactivate, parseCsv, resultOut, sampleCsv, UploadProblem } from './deactivation'
import {
  applyCorrections,
  countsOf,
  entriesOf,
  frozen,
  inventoryDetail,
  inventorySummary,
  liveCounts,
  liveEntries,
  reconciliationItem,
  scan,
  scanOut,
  scansOf,
  storeReports,
} from './inventory'
import { notifyMock } from './mail'
import {
  buildMatrix,
  exportMatrixCsv,
  recalculateStock,
  selectedHubs,
  stockCell,
  type MatrixParams,
} from './stock'
import type { InventoryRow } from './tables'

/** H5 mock endpoints (API.md §8) — answers exactly like `app/modules/h5_stock`. */

const CATEGORIES = new Set<string>([
  'laptop',
  'desktop',
  'tablet',
  'docking_station',
  'monitor',
  'headset',
  'keyboard',
  'mouse',
  'webcam',
  'bag',
  'accessory',
])

function ids(params: URLSearchParams, name: string): number[] | Record<string, string[]> {
  const values = multiValue(params, name)
  const bad = values.filter((v) => !/^\d+$/.test(v))
  if (bad.length) return { [name]: bad.map((v) => `'${v}' is not a valid id.`) }
  return values.map(Number)
}

function versionConflict(current: number, request: Request) {
  return problem(409, 'version_conflict', 'This record changed', {
    detail: 'Someone else updated it. Reload and try again.',
    currentVersion: current,
    request,
  })
}

function matrixParams(request: Request): MatrixParams | Response {
  const params = new URL(request.url).searchParams
  const siteIds = ids(params, 'siteId')
  if (!Array.isArray(siteIds)) return problems.validation(siteIds, undefined, request)
  const categories = multiValue(params, 'category')
  const badCategories = categories.filter((c) => !CATEGORIES.has(c))
  if (badCategories.length)
    return problems.validation(
      { category: badCategories.map((c) => `Unknown value '${c}'.`) },
      undefined,
      request,
    )
  const { unknown } = selectedHubs(siteIds)
  if (unknown.length)
    return problems.validation(
      { siteId: unknown.map((id) => `Site ${id} is not a hub.`) },
      undefined,
      request,
    )
  return {
    siteIds,
    categories: categories as ArticleCategory[],
    q: params.get('q') ?? '',
    onlyShortfall: params.get('onlyShortfall') === 'true',
    includeInactive: params.get('includeInactive') === 'true',
  }
}

function recalculating(): boolean {
  return db
    .collection('background_jobs')
    .all()
    .map((job) => advanceJob(job.id) ?? job)
    .some(
      (job) =>
        job.kind === 'stock_recalculate' && (job.status === 'queued' || job.status === 'running'),
    )
}

function exportLink(filename: string, body: string, actorId: number) {
  return HttpResponse.json(
    downloadLink(
      storeFile({ filename, contentType: 'text/csv', body, purpose: 'export', actorId }),
    ),
  )
}

// ---- stock -----------------------------------------------------------------------------------------

const stockHandlers: RequestHandler[] = [
  http.get(
    apiPath('/stock/matrix'),
    authed('stock.read', ({ request }) => {
      const params = matrixParams(request)
      return params instanceof Response
        ? params
        : HttpResponse.json(buildMatrix(params, recalculating()))
    }),
  ),
  http.post(
    apiPath('/stock/recalculate'),
    authed('stock.recalculate', ({ actor }) => {
      const accepted = startJob({
        kind: 'stock_recalculate',
        actor,
        durationMs: 1600,
        message: 'Recalculating stock and demand',
        run: () => {
          const started = performance.now()
          const result = recalculateStock()
          return {
            kind: 'stock_recalculate',
            articles: result.articles,
            sites: result.sites,
            calculatedAt: result.calculatedAt,
            durationMs: Math.round(performance.now() - started),
          }
        },
      })
      return HttpResponse.json(accepted, { status: 202 })
    }),
  ),
  http.patch(
    apiPath('/stock/buffers'),
    authed('stock.buffers', async ({ request }) => {
      const body = await readJson<{
        siteId: number
        buffers: { articleId: number; bufferQty: number }[]
      }>(request)
      const errors: Record<string, string[]> = {}
      const site =
        typeof body.siteId === 'number' ? db.collection('sites').get(body.siteId) : undefined
      if (site?.kind !== 'hub') errors.siteId = ['Choose a hub (Riverton, Hillford or Eastgate).']
      const buffers = Array.isArray(body.buffers) ? body.buffers : []
      if (buffers.length === 0) errors.buffers = ['List at least one buffer.']
      const settings = site ? settingsOf(site.id) : new Map<number, never>()
      buffers.forEach((entry, index) => {
        if (!Number.isInteger(entry.bufferQty) || entry.bufferQty < 0)
          errors[`buffers.${index}.bufferQty`] = ['Must be a whole number of 0 or more.']
        if (!settings.has(entry.articleId))
          errors[`buffers.${index}.articleId`] = ['Unknown article for this hub.']
      })
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      const data = buffers.map((entry) => {
        const setting = settings.get(entry.articleId)!
        const updated = db
          .collection('article_site_settings')
          .update(setting.id, { bufferQty: entry.bufferQty })!
        return { ...stockCell(updated), articleId: entry.articleId }
      })
      return HttpResponse.json({ data })
    }),
  ),
  http.post(
    apiPath('/stock/export'),
    authed('assets.export', ({ request, actor }) => {
      const params = matrixParams(request)
      if (params instanceof Response) return params
      return exportLink(
        `stock-matrix-${compact(businessToday())}.csv`,
        exportMatrixCsv(params),
        actor.id,
      )
    }),
  ),
]

// ---- call-off orders ----------------------------------------------------------------------------------

function loadOrder(id: string | undefined, request: Request) {
  const order = db.collection('calloff_orders').get(intParam(id))
  return order ?? problems.notFound('Call-off order', id, request)
}

const calloffHandlers: RequestHandler[] = [
  http.get(
    apiPath('/calloff-orders'),
    authed('stock.read', ({ request }) =>
      listResponse(db.collection('calloff_orders').all(), request, {
        sortable: { createdAt: (o) => o.createdAt, deliveryDate: (o) => o.deliveryDate },
        defaultSort: '-createdAt',
        filters: {
          siteId: filterIn((o) => o.siteId),
          status: filterIn((o) => o.status),
          from: filterFrom((o) => o.createdAt),
          to: filterTo((o) => o.createdAt),
        },
        map: summary,
      }),
    ),
  ),
  http.post(
    apiPath('/calloff-orders'),
    authed('calloff.manage', async ({ request, actor }) => {
      const body = await readJson<{ siteId: number; deliveryDate: string; note?: string | null }>(
        request,
      )
      const errors: Record<string, string[]> = {}
      const site =
        typeof body.siteId === 'number' ? db.collection('sites').get(body.siteId) : undefined
      if (site?.kind !== 'hub') errors.siteId = ['Choose a hub (Riverton, Hillford or Eastgate).']
      if (typeof body.deliveryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.deliveryDate))
        errors.deliveryDate = ['A delivery date is required.']
      else if (body.deliveryDate < businessToday())
        errors.deliveryDate = ['The delivery date must not be in the past.']
      if (Object.keys(errors).length || !site || !body.deliveryDate)
        return problems.validation(errors, undefined, request)
      const now = new Date().toISOString()
      const order = db.collection('calloff_orders').insert({
        number: nextNumber(site.code, businessToday()),
        siteId: site.id,
        status: 'draft',
        deliveryDate: body.deliveryDate,
        note: blankToNull(body.note),
        recipientEmail: 'partner-orders@example.com',
        createdBy: actor.id,
        sentAt: null,
        sentBy: null,
        xlsxFileId: null,
        pdfFileId: null,
        version: 1,
        createdAt: now,
      })
      const articles = new Map(
        db
          .collection('articles')
          .all()
          .map((a) => [a.id, a]),
      )
      for (const setting of settingsOf(site.id).values()) {
        if (!articles.get(setting.articleId)?.isActive) continue
        const line = lineFromSetting(order.id, setting)
        if (line.suggestedQty > 0) db.collection('calloff_order_lines').insert(line)
      }
      return HttpResponse.json(detail(order, actor), { status: 201 })
    }),
  ),
  http.get(
    apiPath('/calloff-orders/:id/document'),
    authed<{ id: string }>('stock.read', ({ request, params, actor }) => {
      const order = loadOrder(params.id, request)
      if (order instanceof Response) return order
      const format = new URL(request.url).searchParams.get('format') ?? 'pdf'
      if (format !== 'pdf' && format !== 'xlsx')
        return problems.validation({ format: ["Use 'xlsx' or 'pdf'."] }, undefined, request)
      const fileId = format === 'xlsx' ? order.xlsxFileId : order.pdfFileId
      const stored = fileId ? db.collection('stored_files').get(fileId) : undefined
      if (order.status === 'sent' && stored?.contentBase64)
        return HttpResponse.json(downloadLink(stored))
      const files = storeDocuments(order, actor.id, order.status === 'sent' ? null : 24)
      if (order.status === 'sent')
        db.collection('calloff_orders').update(order.id, {
          xlsxFileId: files.xlsx.id,
          pdfFileId: files.pdf.id,
        })
      return HttpResponse.json(downloadLink(format === 'xlsx' ? files.xlsx : files.pdf))
    }),
  ),
  http.get(
    apiPath('/calloff-orders/:id'),
    authed<{ id: string }>('stock.read', ({ request, params, actor }) => {
      const order = loadOrder(params.id, request)
      return order instanceof Response ? order : HttpResponse.json(detail(order, actor))
    }),
  ),
  http.patch(
    apiPath('/calloff-orders/:id'),
    authed<{ id: string }>('calloff.manage', async ({ request, params, actor }) => {
      const order = loadOrder(params.id, request)
      if (order instanceof Response) return order
      const body = await readJson<{
        version?: number
        deliveryDate?: string
        note?: string | null
        recipientEmail?: string
        lines?: { articleId: number; quantity: number }[]
      }>(request)
      if (typeof body.version === 'number' && body.version !== order.version)
        return versionConflict(order.version, request)
      if (order.status !== 'draft')
        return problems.conflict('Only draft call-off orders can be edited.', request)
      const errors: Record<string, string[]> = {}
      if ('deliveryDate' in body) {
        if (!body.deliveryDate) errors.deliveryDate = ['A delivery date is required.']
        else if (body.deliveryDate < businessToday())
          errors.deliveryDate = ['The delivery date must not be in the past.']
      }
      if ('recipientEmail' in body && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.recipientEmail ?? ''))
        errors.recipientEmail = ['Enter a valid email address.']
      const settings = settingsOf(order.siteId)
      const existing = new Map(linesOf(order.id).map((l) => [l.articleId, l]))
      const seen = new Set<number>()
      ;(body.lines ?? []).forEach((line, index) => {
        if (!Number.isInteger(line.quantity) || line.quantity < 0)
          errors[`lines.${index}.quantity`] = ['Must be a whole number of 0 or more.']
        if (seen.has(line.articleId))
          errors[`lines.${index}.articleId`] = ['This article is listed twice.']
        seen.add(line.articleId)
        if (!existing.has(line.articleId)) {
          const article = db.collection('articles').get(line.articleId)
          if (!settings.has(line.articleId) || !article)
            errors[`lines.${index}.articleId`] = ['Unknown article.']
          else if (!article.isActive && line.quantity > 0)
            errors[`lines.${index}.articleId`] = ['This article is inactive.']
        }
      })
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      for (const line of body.lines ?? []) {
        const current = existing.get(line.articleId)
        const setting = settings.get(line.articleId)
        if (!current) {
          if (line.quantity > 0 && setting)
            db.collection('calloff_order_lines').insert(
              lineFromSetting(order.id, setting, line.quantity),
            )
        } else if (line.quantity === 0) db.collection('calloff_order_lines').remove(current.id)
        else db.collection('calloff_order_lines').update(current.id, { quantity: line.quantity })
      }
      const updated = db.collection('calloff_orders').update(order.id, {
        ...(body.deliveryDate ? { deliveryDate: body.deliveryDate } : {}),
        ...('note' in body ? { note: blankToNull(body.note) } : {}),
        ...(body.recipientEmail ? { recipientEmail: body.recipientEmail.toLowerCase() } : {}),
        version: order.version + 1,
      })!
      return HttpResponse.json(detail(updated, actor))
    }),
  ),
  http.post(
    apiPath('/calloff-orders/:id/actions/:action'),
    authed<{ id: string; action: string }>('calloff.manage', async ({ request, params, actor }) => {
      const order = loadOrder(params.id, request)
      if (order instanceof Response) return order
      if (params.action !== 'send' && params.action !== 'cancel')
        return problem(404, 'unknown_action', 'Unknown action', {
          detail: `Unknown action '${params.action}'.`,
          request,
        })
      const body = await readJson<{ version?: number; comment?: string }>(request)
      if (typeof body.version === 'number' && body.version !== order.version)
        return versionConflict(order.version, request)
      if (order.status !== 'draft')
        return problem(409, 'transition_not_allowed', 'Action not possible', {
          detail: `Action '${params.action}' is not allowed while the order is '${order.status}'.`,
          allowedActions: [],
          request,
        })
      if (params.action === 'cancel') {
        const comment = body.comment?.trim()
        const note = comment ? `Cancelled by ${actor.displayName}: ${comment}` : null
        const updated = db.collection('calloff_orders').update(order.id, {
          status: 'cancelled',
          note: note ? (order.note ? `${order.note}\n${note}` : note) : order.note,
          version: order.version + 1,
        })!
        return HttpResponse.json(detail(updated, actor))
      }
      const failure = sendFailure(order)
      if (failure)
        return problem(409, 'guard_failed', 'Precondition failed', {
          detail: failure.message,
          guard: failure,
          request,
        })
      const sent = db.collection('calloff_orders').update(order.id, {
        status: 'sent',
        sentAt: new Date().toISOString(),
        sentBy: actor.id,
        version: order.version + 1,
      })!
      const files = storeDocuments(sent, actor.id, null)
      db.collection('calloff_orders').update(order.id, {
        xlsxFileId: files.xlsx.id,
        pdfFileId: files.pdf.id,
      })
      const settings = settingsOf(order.siteId)
      for (const line of linesOf(order.id)) {
        const setting = settings.get(line.articleId)
        if (setting && line.quantity > 0)
          db.collection('article_site_settings').update(setting.id, {
            lastOrderDate: businessToday(),
            lastOrderedQty: line.quantity,
          })
      }
      const site = db.collection('sites').get(order.siteId)
      notifyMock({
        templateId: 'calloff.order',
        subject: `Call-off order ${order.number} – ${site?.name ?? ''} – delivery ${order.deliveryDate}`,
        to: [order.recipientEmail],
        cc: [TEAM_MAILBOX],
        entity: { type: 'calloff_order', id: order.id, label: order.number },
        attachments: [files.xlsx.id, files.pdf.id],
        actorId: actor.id,
      })
      return HttpResponse.json(detail(db.collection('calloff_orders').get(order.id)!, actor))
    }),
  ),
]

// ---- assets ----------------------------------------------------------------------------------------------

const assetHandlers: RequestHandler[] = [
  http.get(
    apiPath('/assets'),
    authed('stock.read', ({ request, actor }) => {
      const filtered = assetRows(request)
      if (filtered instanceof Response) return filtered
      return listResponse(filtered, request, {
        sortable: assetSortable,
        defaultSort: '-statusChangedAt',
        search: ASSET_SEARCH,
        filters: assetFilters,
        map: (row) => assetListItem(row, actor),
      })
    }),
  ),
  http.post(
    apiPath('/assets/export'),
    authed('assets.export', ({ request, actor }) => {
      const filtered = assetRows(request)
      if (filtered instanceof Response) return filtered
      const rows = queryRows(filtered, request, {
        sortable: assetSortable,
        defaultSort: '-statusChangedAt',
        search: ASSET_SEARCH,
        filters: assetFilters,
      })
      if (rows instanceof Response) return rows
      return exportLink(`assets-${compact(businessToday())}.csv`, exportAssetsCsv(rows), actor.id)
    }),
  ),
  http.get(
    apiPath('/assets/by-serial/:serial'),
    authed<{ serial: string }>('stock.read', ({ request, params, actor }) => {
      const value = normalizeSerial(params.serial)
      const assets = db.collection('assets')
      const asset = value
        ? (assets.find((a) => a.serialNumber === value) ?? assets.find((a) => a.assetTag === value))
        : undefined
      return asset
        ? HttpResponse.json(assetDetail(asset, actor))
        : problems.notFound('Asset', params.serial, request)
    }),
  ),
  http.get(
    apiPath('/assets/:id/movements'),
    authed<{ id: string }>('stock.read', ({ request, params }) => {
      const asset = db.collection('assets').get(intParam(params.id))
      if (!asset) return problems.notFound('Asset', params.id, request)
      const page = paginate(movementsOf(asset.id), parsePage(new URL(request.url).searchParams))
      return HttpResponse.json({ data: page.data.map(assetMovement), meta: page.meta })
    }),
  ),
  http.patch(
    apiPath('/assets/:id'),
    authed<{ id: string }>('assets.update', async ({ request, params, actor }) => {
      const asset = db.collection('assets').get(intParam(params.id))
      if (!asset) return problems.notFound('Asset', params.id, request)
      const body = await readJson<AssetPatch & Record<string, unknown>>(request)
      const allowed = new Set(['version', 'assetTag', 'macAddress', 'externalAssetId', 'ciName'])
      const unknown = Object.keys(body).filter((key) => !allowed.has(key))
      if (unknown.length)
        return problems.validation(
          Object.fromEntries(unknown.map((k) => [k, ['Unknown field.']])),
          undefined,
          request,
        )
      if (typeof body.version === 'number' && body.version !== asset.version)
        return versionConflict(asset.version, request)
      const patch: Partial<typeof asset> = {}
      if ('assetTag' in body) {
        const tag = normalizeSerial(body.assetTag)
        if (
          tag &&
          tag !== asset.assetTag &&
          db.collection('assets').find((a) => a.assetTag === tag && a.id !== asset.id)
        )
          return problems.conflict(`Asset tag ${tag} is already used by another asset.`, request)
        patch.assetTag = tag
      }
      if ('macAddress' in body) {
        if (body.macAddress) {
          const hex = body.macAddress.replace(/[^0-9a-f]/gi, '').toUpperCase()
          if (hex.length !== 12)
            return problems.validation(
              { macAddress: ['Use the format AA:BB:CC:DD:EE:FF.'] },
              undefined,
              request,
            )
          patch.macAddress = (hex.match(/.{2}/g) ?? []).join(':')
        } else patch.macAddress = null
      }
      if ('externalAssetId' in body) patch.externalAssetId = blankToNull(body.externalAssetId)
      if ('ciName' in body) patch.ciName = blankToNull(body.ciName)
      const updated = db
        .collection('assets')
        .update(asset.id, { ...patch, version: asset.version + 1 })!
      return HttpResponse.json(assetDetail(updated, actor))
    }),
  ),
]

// ---- deactivations ----------------------------------------------------------------------------------------

const REASONS = new Set<string>(['returned_to_lessor', 'bought_out', 'disposed'])

const deactivationHandlers: RequestHandler[] = [
  http.post(
    apiPath('/deactivations'),
    authed('assets.deactivate', async ({ request, actor }) => {
      const form = await request.formData()
      const file = form.get('file')
      const reason = form.get('reason')
      const errors: Record<string, string[]> = {}
      // undici's File (MSW in Node) is not jsdom's File: check the shape, not the class
      const upload = typeof file === 'object' && file !== null && 'text' in file ? file : null
      if (!upload) errors.file = ['Choose a file.']
      if (typeof reason !== 'string' || !REASONS.has(reason)) errors.reason = ['Choose a reason.']
      if (Object.keys(errors).length || !upload)
        return problems.validation(errors, undefined, request)
      // jsdom → undici loses the part's filename in Node tests ("blob"): treat it as CSV
      const filename = upload.name && upload.name !== 'blob' ? upload.name : 'upload.csv'
      const ext = filename.toLowerCase().split('.').pop() ?? ''
      if (ext === 'xlsx')
        return problem(400, 'invalid_file', 'Not available in the demo', {
          detail: 'The demo reads CSV only. Save the sheet as CSV UTF-8 and upload it again.',
          request,
        })
      if (ext !== 'csv')
        return problem(415, 'unsupported_media_type', 'Unsupported file type', {
          detail: `Unsupported file type '.${ext}'. Allowed: .csv, .xlsx.`,
          request,
        })
      const text = await upload.text()
      try {
        const rows = parseCsv(text)
        const batch = deactivate(rows, reason as DeactivationReason, filename, text, actor)
        recalculateStock()
        return HttpResponse.json(resultOut(batch))
      } catch (error) {
        if (error instanceof UploadProblem)
          return problem(
            error.status,
            error.code,
            error.code === 'missing_columns' ? 'Missing columns' : 'Invalid file',
            {
              detail: error.message,
              ...(error.code === 'missing_columns'
                ? { errors: { file: ['Missing column: serial_number.'] } }
                : {}),
              request,
            },
          )
        throw error
      }
    }),
  ),
  http.get(
    apiPath('/deactivations'),
    authed('stock.read', ({ request }) =>
      listResponse(db.collection('deactivation_batches').all(), request, {
        sortable: { createdAt: (b) => b.createdAt },
        defaultSort: '-createdAt',
        map: batchOut,
      }),
    ),
  ),
  http.get(
    apiPath('/deactivations/sample'),
    authed('assets.deactivate', ({ actor }) =>
      exportLink('deactivation-sample.csv', sampleCsv(), actor.id),
    ),
  ),
  http.get(
    apiPath('/deactivations/:id'),
    authed<{ id: string }>('stock.read', ({ request, params }) => {
      const batch = db.collection('deactivation_batches').get(intParam(params.id))
      return batch
        ? HttpResponse.json(resultOut(batch))
        : problems.notFound('Deactivation batch', params.id, request)
    }),
  ),
]

// ---- inventories -------------------------------------------------------------------------------------------

function loadInventory(id: string | undefined, request: Request): InventoryRow | Response {
  return (
    db.collection('inventories').get(intParam(id)) ?? problems.notFound('Inventory', id, request)
  )
}

function reportFromFrozen(inventory: InventoryRow, kind: string): string {
  const entries = entriesOf(inventory).filter((e) => e.category === kind)
  const locations = new Map(
    db
      .collection('stock_locations')
      .all()
      .map((l) => [l.id, l.name]),
  )
  const users = new Map(
    db
      .collection('users')
      .all()
      .map((u) => [u.id, `${u.firstName} ${u.lastName}`]),
  )
  return csv([
    [
      'Serial',
      'Asset tag',
      'Article',
      'Status',
      'Recorded location',
      'Scanned location',
      'Scanned by',
      'Scanned at',
    ],
    ...entries.map((e) => [
      e.serial,
      e.asset?.assetTag,
      e.asset?.articleId ? db.collection('articles').get(e.asset.articleId)?.name : e.asset?.model,
      e.status ? label('assetStatus', e.status) : null,
      e.recordedLocationId ? locations.get(e.recordedLocationId) : null,
      e.scannedLocationId ? locations.get(e.scannedLocationId) : null,
      e.scannedById ? users.get(e.scannedById) : null,
      e.scannedAt,
    ]),
  ])
}

const inventoryHandlers: RequestHandler[] = [
  http.get(
    apiPath('/inventories'),
    authed('inventory.read', ({ request }) =>
      listResponse(db.collection('inventories').all(), request, {
        sortable: { openedAt: (i) => i.openedAt },
        defaultSort: '-openedAt',
        filters: { siteId: filterIn((i) => i.siteId), status: filterIn((i) => i.status) },
        map: inventorySummary,
      }),
    ),
  ),
  http.post(
    apiPath('/inventories'),
    authed('inventory.manage', async ({ request, actor }) => {
      const body = await readJson<{ siteId: number; note?: string | null }>(request)
      const site =
        typeof body.siteId === 'number' ? db.collection('sites').get(body.siteId) : undefined
      if (!site?.isActive)
        return problems.validation({ siteId: ['Choose a hub or the Campus.'] }, undefined, request)
      const existing = db
        .collection('inventories')
        .find((i) => i.siteId === site.id && i.status === 'open')
      if (existing)
        return problem(409, 'inventory_already_open', 'Conflict', {
          detail: `An inventory is already open for ${site.name} (#${existing.id}).`,
          request,
        })
      const now = new Date().toISOString()
      const inventory = db.collection('inventories').insert({
        siteId: site.id,
        status: 'open',
        openedAt: now,
        openedBy: actor.id,
        closedAt: null,
        closedBy: null,
        countDate: null,
        applyCorrections: null,
        resultSummary: null,
        reconciliation: null,
        missingReportFileId: null,
        wrongLocationReportFileId: null,
        unknownReportFileId: null,
        note: blankToNull(body.note),
        version: 1,
        createdAt: now,
      })
      return HttpResponse.json(inventoryDetail(inventory, actor), { status: 201 })
    }),
  ),
  http.get(
    apiPath('/inventories/:id'),
    authed<{ id: string }>('inventory.read', ({ request, params, actor }) => {
      const inventory = loadInventory(params.id, request)
      return inventory instanceof Response
        ? inventory
        : HttpResponse.json(inventoryDetail(inventory, actor))
    }),
  ),
  http.post(
    apiPath('/inventories/:id/scans'),
    authed<{ id: string }>('inventory.scan', async ({ request, params, actor }) => {
      const inventory = loadInventory(params.id, request)
      if (inventory instanceof Response) return inventory
      const body = await readJson<{ serial: string; stockLocationId?: number | null }>(request)
      const value = normalizeSerial(body.serial)
      if (!value)
        return problems.validation(
          { serial: ['Scan or type a serial number.'] },
          undefined,
          request,
        )
      if (inventory.status !== 'open')
        return problems.conflict(
          `The inventory is ${inventory.status}; scans are no longer possible.`,
          request,
        )
      let zone = null
      if (body.stockLocationId !== null && body.stockLocationId !== undefined) {
        const location = db.collection('stock_locations').get(body.stockLocationId)
        if (location?.siteId !== inventory.siteId)
          return problems.validation(
            { stockLocationId: ['Choose a zone of this site.'] },
            undefined,
            request,
          )
        zone = location
      }
      return HttpResponse.json(scan(inventory, value, zone, actor))
    }),
  ),
  http.get(
    apiPath('/inventories/:id/scans'),
    authed<{ id: string }>('inventory.read', ({ request, params }) => {
      const inventory = loadInventory(params.id, request)
      if (inventory instanceof Response) return inventory
      return listResponse(scansOf(inventory.id), request, {
        sortable: { scannedAt: (s) => s.scannedAt },
        defaultSort: '-scannedAt',
        search: (s, q) => s.serialNumber.includes(q.toUpperCase()),
        filters: { result: filterIn((s) => s.result), scannedById: filterIn((s) => s.scannedBy) },
        map: scanOut,
      })
    }),
  ),
  http.delete(
    apiPath('/inventories/:id/scans/:scanId'),
    authed<{ id: string; scanId: string }>('inventory.scan', ({ request, params, actor }) => {
      const inventory = loadInventory(params.id, request)
      if (inventory instanceof Response) return inventory
      const row = db.collection('inventory_scans').get(intParam(params.scanId))
      if (row?.inventoryId !== inventory.id)
        return problems.notFound('Scan', params.scanId, request)
      if (inventory.status !== 'open')
        return problem(409, 'undo_not_possible', 'Undo not possible', {
          detail: 'The inventory is no longer open; scans cannot be undone.',
          request,
        })
      if (row.scannedBy !== actor.id && !actor.permissions.includes('inventory.manage'))
        return problems.forbidden('You can only undo your own scans.', request)
      db.collection('inventory_scans').remove(row.id)
      return noContent()
    }),
  ),
  http.get(
    apiPath('/inventories/:id/reconciliation'),
    authed<{ id: string }>('inventory.read', ({ request, params }) => {
      const inventory = loadInventory(params.id, request)
      if (inventory instanceof Response) return inventory
      const search = new URL(request.url).searchParams
      const category = search.get('category')
      if (category && !['matched', 'missing', 'wrong_location', 'unknown'].includes(category))
        return problems.validation(
          { category: [`Unknown value '${category}'.`] },
          undefined,
          request,
        )
      const entries = entriesOf(inventory).filter((e) => !category || e.category === category)
      const page = paginate(entries, parsePage(search))
      return HttpResponse.json({
        data: page.data.map(reconciliationItem),
        meta: page.meta,
        summary: countsOf(inventory),
      })
    }),
  ),
  http.post(
    apiPath('/inventories/:id/actions/:action'),
    authed<{ id: string; action: string }>(
      'inventory.manage',
      async ({ request, params, actor }) => {
        const inventory = loadInventory(params.id, request)
        if (inventory instanceof Response) return inventory
        const action = params.action
        if (action !== 'close' && action !== 'cancel')
          return problem(404, 'unknown_action', 'Unknown action', {
            detail: `Unknown action '${action}'.`,
            request,
          })
        const body = await readJson<{
          countDate?: string
          applyCorrections?: boolean
          comment?: string
          version?: number
        }>(request)
        if (typeof body.version === 'number' && body.version !== inventory.version)
          return versionConflict(inventory.version, request)
        if (inventory.status !== 'open')
          return problem(409, 'transition_not_allowed', 'Action not possible', {
            detail: `Action '${action}' is not allowed while the inventory is '${inventory.status}'.`,
            allowedActions: [],
            request,
          })
        const now = new Date().toISOString()
        if (action === 'cancel') {
          const comment = body.comment?.trim()
          const note = comment ? `Cancelled by ${actor.displayName}: ${comment}` : null
          const updated = db.collection('inventories').update(inventory.id, {
            status: 'cancelled',
            resultSummary: liveCounts(inventory),
            reconciliation: liveEntries(inventory).map(frozen),
            closedAt: now,
            closedBy: actor.id,
            note: note ? (inventory.note ? `${inventory.note}\n${note}` : note) : inventory.note,
            version: inventory.version + 1,
          })!
          return HttpResponse.json(inventoryDetail(updated, actor))
        }
        const errors: Record<string, string[]> = {}
        if (typeof body.countDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.countDate))
          errors.countDate = ['A count date is required.']
        else if (body.countDate > businessToday())
          errors.countDate = ['The count date cannot be in the future.']
        if (typeof body.applyCorrections !== 'boolean') errors.applyCorrections = ['Field required']
        if (Object.keys(errors).length || !body.countDate)
          return problems.validation(errors, undefined, request)
        const entries = liveEntries(inventory)
        const counts = liveCounts(inventory)
        if (body.applyCorrections) counts.corrected = applyCorrections(inventory, entries, actor)
        const files = storeReports(inventory, entries, actor.id)
        const updated = db.collection('inventories').update(inventory.id, {
          status: 'closed',
          resultSummary: counts,
          reconciliation: entries.map(frozen),
          closedAt: now,
          closedBy: actor.id,
          countDate: body.countDate,
          applyCorrections: Boolean(body.applyCorrections),
          missingReportFileId: files.missing,
          wrongLocationReportFileId: files.wrong_location,
          unknownReportFileId: files.unknown,
          version: inventory.version + 1,
        })!
        const site = db.collection('sites').get(inventory.siteId)
        notifyMock({
          templateId: 'inventory.report',
          subject: `Inventory ${site?.name ?? ''} closed: ${counts.missing} missing, ${counts.wrongLocation} misplaced`,
          to: [TEAM_MAILBOX],
          cc: [],
          entity: { type: 'inventory', id: inventory.id, label: `Inventory ${site?.name ?? ''}` },
          attachments: [files.missing, files.wrong_location, files.unknown],
          actorId: actor.id,
        })
        recalculateStock()
        return HttpResponse.json(inventoryDetail(updated, actor))
      },
    ),
  ),
  http.get(
    apiPath('/inventories/:id/reports/:kind'),
    authed<{ id: string; kind: string }>('inventory.read', ({ request, params }) => {
      const inventory = loadInventory(params.id, request)
      if (inventory instanceof Response) return inventory
      const kind = params.kind
      if (!['missing', 'wrong_location', 'unknown'].includes(kind))
        return problems.validation({ kind: [`Unknown value '${kind}'.`] }, undefined, request)
      if (inventory.status !== 'closed')
        return problems.notFound('Report', `${inventory.id}/${kind}`, request)
      const fileId =
        kind === 'missing'
          ? inventory.missingReportFileId
          : kind === 'wrong_location'
            ? inventory.wrongLocationReportFileId
            : inventory.unknownReportFileId
      const stored = fileId ? db.collection('stored_files').get(fileId) : undefined
      if (stored?.contentBase64) return HttpResponse.json(downloadLink(stored))
      // exported reports carry no bytes in the demo: rebuild from the frozen reconciliation
      const site = db.collection('sites').get(inventory.siteId)
      const regenerated = storeFile({
        filename:
          stored?.filename ??
          `inventory-${inventory.id}-${(site?.code ?? '').toLowerCase()}-${kind.replace('_', '-')}.csv`,
        contentType: 'text/csv',
        body: reportFromFrozen(inventory, kind),
        purpose: 'inventory_report',
        entity: { type: 'inventory', id: inventory.id },
        ttlHours: null,
      })
      return HttpResponse.json(downloadLink(regenerated))
    }),
  ),
]

// ---- dashboard ---------------------------------------------------------------------------------------------

const dashboardHandlers: RequestHandler[] = [
  http.get(
    apiPath('/dashboard/kpis'),
    authed('dashboard.read', ({ request }) => {
      const params = new URL(request.url).searchParams
      const errors: Record<string, string[]> = {}
      const parse = (name: 'siteId' | 'regionId') => {
        const raw = params.get(name)
        if (!raw) return null
        const exists =
          /^\d+$/.test(raw) &&
          (name === 'siteId'
            ? db.collection('sites').has(Number(raw))
            : db.collection('regions').has(Number(raw)))
        if (!exists) {
          errors[name] = [name === 'siteId' ? 'Unknown site.' : 'Unknown region.']
          return null
        }
        return Number(raw)
      }
      const siteId = parse('siteId')
      const regionId = parse('regionId')
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      return HttpResponse.json(dashboardKpis(siteId, regionId))
    }),
  ),
]

export const handlers: RequestHandler[] = [
  ...stockHandlers,
  ...calloffHandlers,
  ...assetHandlers,
  ...deactivationHandlers,
  ...inventoryHandlers,
  ...dashboardHandlers,
]
