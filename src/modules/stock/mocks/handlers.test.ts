import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { api } from '@/lib/api/client'
import { isApiError } from '@/lib/api/errors'
import { addWorkingDays, businessToday } from '@/lib/format'
import type {
  AssetDetail,
  CallOffOrder,
  DashboardKpis,
  DeactivationResult,
  InventoryDetail,
  InventoryScan,
  List,
  Page,
  Reconciliation,
  ScanResult,
  StockMatrix,
} from '@/lib/api/types'
import type { AssetListItem, CallOffOrderSummary, InventorySummary } from '@/lib/api/types'
import { db } from '@/mocks/db'
import type { SeedFixture } from '@/mocks/fixtures/types'
import { PERSONA_EMAILS, signInAs } from '@/test/utils'

async function expectProblem(promise: Promise<unknown>, status: number, code?: string) {
  try {
    await promise
  } catch (error) {
    expect(isApiError(error)).toBe(true)
    if (isApiError(error)) {
      expect(error.status).toBe(status)
      if (code) expect(error.code).toBe(code)
      return error
    }
  }
  throw new Error(`expected HTTP ${status}`)
}

function siteId(code: string): number {
  const site = db.collection('sites').find((s) => s.code === code)
  if (!site) throw new Error(code)
  return site.id
}

function location(code: string) {
  const loc = db.collection('stock_locations').find((l) => l.code === code)
  if (!loc) throw new Error(code)
  return loc
}

describe('H5 seed (fallback mirrors the backend story)', () => {
  it('creates the three inventories with the fixed ids', async () => {
    await signInAs(PERSONA_EMAILS.viewer)
    const page = await api.get<Page<InventorySummary>>('/inventories')
    const byId = new Map(page.data.map((i) => [i.id, i]))
    expect(byId.get(1)?.site.code).toBe('EAS')
    expect(byId.get(1)?.status).toBe('closed')
    expect(byId.get(1)?.summary.missing).toBe(2)
    expect(byId.get(2)?.site.code).toBe('RIV')
    expect(byId.get(2)?.summary.corrected).toBe(2)
    const hil = byId.get(3)
    expect(hil?.status).toBe('open')
    expect(hil?.summary.wrongLocation).toBe(3)
    expect(hil?.summary.unknown).toBe(2)
    const ratio = (hil?.summary.matched ?? 0) / (hil?.summary.expected ?? 1)
    expect(ratio).toBeGreaterThan(0.4)
    expect(ratio).toBeLessThan(0.8)
  })

  it('seeds 9 sent call-offs, an Eastgate draft and both deactivation batches', async () => {
    await signInAs(PERSONA_EMAILS.viewer)
    const orders = await api.get<Page<CallOffOrderSummary>>('/calloff-orders', {
      query: { perPage: 50 },
    })
    expect(orders.data.filter((o) => o.status === 'sent')).toHaveLength(9)
    const [draft] = orders.data.filter((o) => o.status === 'draft')
    expect(draft?.site.code).toBe('EAS')
    const batches = await api.get<
      Page<{ id: number; totalRows: number; deactivatedCount: number }>
    >('/deactivations', { query: { sort: 'createdAt' } })
    expect(batches.data.map((b) => [b.id, b.totalRows, b.deactivatedCount])).toEqual([
      [1, 32, 30],
      [2, 6, 6],
    ])
  })

  it('recalculates stock exactly like the backend (parity with the exported settings)', () => {
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src/mocks/fixtures/seed.json'), 'utf8'),
    ) as SeedFixture
    const exported = new Map(fixture.tables.article_site_settings.map((s) => [s.id, s]))
    for (const row of db.collection('article_site_settings').all()) {
      const original = exported.get(row.id)
      expect(row.stockQty, `stock ${row.articleId}@${row.siteId}`).toBe(original?.stockQty)
      expect(row.demandQty, `demand ${row.articleId}@${row.siteId}`).toBe(original?.demandQty)
    }
  })
})

describe('stock matrix', () => {
  it('returns hubs × articles with the #18 order formula', async () => {
    await signInAs(PERSONA_EMAILS.viewer)
    const matrix = await api.get<StockMatrix>('/stock/matrix')
    expect(matrix.sites.map((s) => s.code)).toEqual(['RIV', 'HIL', 'EAS'])
    for (const row of matrix.rows)
      for (const cell of row.cells)
        expect(cell.orderQty).toBe(Math.max(0, cell.demand + cell.buffer - cell.stock))
    const filtered = await api.get<StockMatrix>('/stock/matrix', {
      query: { siteId: [siteId('EAS')], onlyShortfall: true },
    })
    expect(filtered.sites).toHaveLength(1)
    expect(
      filtered.rows.every((r) => r.cells.some((c) => c.orderQty > 0 || c.demand > c.stock)),
    ).toBe(true)
    await expectProblem(api.get('/stock/matrix', { query: { siteId: [siteId('CMP')] } }), 422)
  })

  it('edits buffers (dispatcher) and refuses viewers', async () => {
    await signInAs(PERSONA_EMAILS.viewer)
    const article = db.collection('articles').find((a) => a.number === 'A-10101')!
    const body = { siteId: siteId('RIV'), buffers: [{ articleId: article.id, bufferQty: 7 }] }
    await expectProblem(api.patch('/stock/buffers', body), 403)
    await signInAs(PERSONA_EMAILS.dispatcher)
    const result = await api.patch<{ data: { articleId: number; buffer: number }[] }>(
      '/stock/buffers',
      body,
    )
    expect(result.data[0]?.buffer).toBe(7)
    const bad = await expectProblem(
      api.patch('/stock/buffers', { ...body, buffers: [{ articleId: article.id, bufferQty: -2 }] }),
      422,
    )
    expect(bad.fieldErrors['buffers.0.bufferQty']).toBeDefined()
  })

  it('starts a recalculation job', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const accepted = await api.post<{ jobId: number; status: string }>('/stock/recalculate', {})
    expect(accepted.status).toBe('queued')
    const matrix = await api.get<StockMatrix>('/stock/matrix')
    expect(matrix.meta.recalculating).toBe(true)
  })
})

describe('call-off orders', () => {
  it('creates a draft from the matrix, edits lines and sends it', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const created = await api.post<CallOffOrder>('/calloff-orders', {
      siteId: siteId('HIL'),
      deliveryDate: addWorkingDays(businessToday(), 3),
    })
    expect(created.status).toBe('draft')
    expect(created.availableActions).toContain('cancel')
    const pen = db.collection('articles').find((a) => a.internalDescription === 'Stylus Pen')!
    const patched = await api.patch<CallOffOrder>(`/calloff-orders/${created.id}`, {
      version: created.version,
      lines: [{ articleId: pen.id, quantity: 2 }],
    })
    expect(patched.lines.some((l) => l.article.id === pen.id && l.quantity === 2)).toBe(true)
    const sent = await api.post<CallOffOrder>(`/calloff-orders/${created.id}/actions/send`, {
      version: patched.version,
    })
    expect(sent.status).toBe('sent')
    expect(sent.availableActions).toEqual([])
    const mail = db.collection('stock_mail_outbox').find((m) => m.entityId === created.id)
    expect(mail?.to).toEqual(['partner-orders@example.com'])
    expect(mail?.attachmentFileIds).toHaveLength(2)
    await expectProblem(
      api.post(`/calloff-orders/${created.id}/actions/send`, {}),
      409,
      'transition_not_allowed',
    )
  })

  it('guards send without lines (409 no_lines)', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const created = await api.post<CallOffOrder>('/calloff-orders', {
      siteId: siteId('RIV'),
      deliveryDate: addWorkingDays(businessToday(), 3),
    })
    const emptied = await api.patch<CallOffOrder>(`/calloff-orders/${created.id}`, {
      lines: created.lines.map((l) => ({ articleId: l.article.id, quantity: 0 })),
    })
    expect(emptied.warnings).toContain('zero_lines')
    const error = await expectProblem(
      api.post(`/calloff-orders/${created.id}/actions/send`, {}),
      409,
      'guard_failed',
    )
    expect(error.guard?.code).toBe('no_lines')
  })
})

describe('inventories', () => {
  it('scans with the API verdicts, then closes with corrections', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    await expectProblem(
      api.post('/inventories', { siteId: siteId('HIL') }),
      409,
      'inventory_already_open',
    )
    const opened = await api.post<InventoryDetail>('/inventories', { siteId: siteId('RIV') })
    expect(opened.availableActions).toEqual(['close', 'cancel'])
    const here = db
      .collection('assets')
      .find((a) => a.locationId === location('RIV-STAGING').id && a.status === 'available')!
    const goodsIn = db
      .collection('assets')
      .find((a) => a.locationId === location('RIV-GOODS_IN').id && a.status === 'available')!
    const elsewhere = db
      .collection('assets')
      .find((a) => a.locationId === location('HIL-STAGING').id && a.status === 'available')!
    await signInAs(PERSONA_EMAILS.technician)
    const scan = (serial: string, stockLocationId?: number) =>
      api.post<ScanResult<InventoryScan>>(`/inventories/${opened.id}/scans`, {
        serial,
        stockLocationId,
      })
    const ok = await scan(here.serialNumber.toLowerCase())
    expect([ok.verdict, ok.code]).toEqual(['ok', 'matched'])
    expect(ok.undo?.method).toBe('DELETE')
    const duplicate = await scan(here.serialNumber)
    expect([duplicate.verdict, duplicate.code, duplicate.applied]).toEqual([
      'warning',
      'duplicate',
      false,
    ])
    const zone = await scan(goodsIn.serialNumber, location('RIV-STAGING').id)
    expect(zone.code).toBe('wrong_zone')
    const site = await scan(elsewhere.serialNumber)
    expect(site.code).toBe('wrong_site')
    expect(site.message).toBe('Recorded at Hillford · Staging.')
    const unknown = await scan('nope-123')
    expect([unknown.verdict, unknown.code]).toEqual(['warning', 'unknown_recorded'])
    await expectProblem(api.post(`/inventories/${opened.id}/actions/close`, {}), 403)

    await signInAs(PERSONA_EMAILS.dispatcher)
    const reco = await api.get<Reconciliation>(`/inventories/${opened.id}/reconciliation`, {
      query: { category: 'wrong_location' },
    })
    expect(reco.data.every((i) => i.correctable)).toBe(true)
    const closed = await api.post<InventoryDetail>(`/inventories/${opened.id}/actions/close`, {
      countDate: businessToday(),
      applyCorrections: true,
    })
    expect(closed.status).toBe('closed')
    expect(closed.summary.corrected).toBeGreaterThan(0)
    expect(db.collection('assets').get(elsewhere.id)?.locationId).toBe(location('RIV-GOODS_IN').id)
    expect(db.collection('assets').get(goodsIn.id)?.locationId).toBe(location('RIV-STAGING').id)
    const missing = await api.get<Reconciliation>(`/inventories/${opened.id}/reconciliation`, {
      query: { category: 'missing', perPage: 1 },
    })
    const probe = missing.data[0]?.asset
    expect(probe?.status).toBe('missing')
    const report = await api.get<{ filename: string }>(`/inventories/${opened.id}/reports/missing`)
    expect(report.filename).toMatch(/missing\.csv$/)
  })

  it('lets technicians undo only their own scans', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const opened = await api.post<InventoryDetail>('/inventories', { siteId: siteId('EAS') })
    const asset = db
      .collection('assets')
      .find((a) => a.locationId === location('EAS-STAGING').id && a.status === 'available')!
    const mine = await api.post<ScanResult<InventoryScan>>(`/inventories/${opened.id}/scans`, {
      serial: asset.serialNumber,
    })
    await signInAs(PERSONA_EMAILS.technician)
    await expectProblem(api.delete(mine.undo!.href), 403)
  })
})

describe('deactivation', () => {
  it('deactivates collected devices, rejects workflow ones and lists not-found serials', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const collected = db.collection('assets').find((a) => a.status === 'collected')!
    const assigned = db.collection('assets').find((a) => a.status === 'assigned')!
    const form = new FormData()
    form.append(
      'file',
      new Blob(
        [`serial_number\n${collected.serialNumber}\n${assigned.serialNumber}\nNOT-THERE\n`],
        {
          type: 'text/csv',
        },
      ),
      'returns.csv',
    )
    form.append('reason', 'returned_to_lessor')
    const result = await api.upload<DeactivationResult>('/deactivations', form)
    expect([result.deactivatedCount, result.rejectedCount, result.notFoundCount]).toEqual([1, 1, 1])
    expect(result.notFoundReport?.filename).toMatch(/not-found\.csv$/)
    expect(db.collection('assets').get(collected.id)?.status).toBe('deactivated_returned')
    const missingColumn = new FormData()
    missingColumn.append('file', new Blob(['serial\nX\n'], { type: 'text/csv' }), 'x.csv')
    missingColumn.append('reason', 'disposed')
    await expectProblem(api.upload('/deactivations', missingColumn), 422, 'missing_columns')
  })
})

describe('assets and dashboard', () => {
  it('lists, filters and corrects assets with the API rules', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const page = await api.get<Page<AssetListItem>>('/assets', {
      query: { status: ['missing'], perPage: 50 },
    })
    expect(page.meta.total).toBe(4)
    const asset = page.data[0]!
    const bad = await expectProblem(
      api.post(`/assets/${asset.id}/actions/correct`, {
        status: 'collected',
        reason: 'x',
        comment: 'x',
      }),
      422,
    )
    expect(bad.fieldErrors.status).toBeDefined()
    const goodsIn = location('HIL-GOODS_IN')
    const found = await api.post<AssetDetail>(`/assets/${asset.id}/actions/mark_found`, {
      locationId: goodsIn.id,
    })
    expect(found.status).toBe('available')
    const sites = await api.get<List<{ id: number }>>('/sites')
    expect(sites.data.length).toBeGreaterThan(0)
  })

  it('serves KPIs with 14-day series', async () => {
    await signInAs(PERSONA_EMAILS.viewer)
    const kpis = await api.get<DashboardKpis>('/dashboard/kpis')
    expect(kpis.series.completionsPerDay).toHaveLength(14)
    expect(kpis.series.appointmentsPerDay[0]?.date).toBe(kpis.today)
    expect(kpis.tiles.openInventories).toBe(1)
    expect(kpis.stageCounts).toHaveLength(8)
    expect(kpis.regionLoad).toHaveLength(9)
    await expectProblem(api.get('/dashboard/kpis', { query: { siteId: 999 } }), 422)
  })
})
