import type { ArticleCategory, ServiceRequestStatus, StockCell, StockMatrix } from '@/lib/api/types'
import { db } from '@/mocks/db'
import type { ArticleSiteSettingRow } from '@/mocks/fixtures/types'
import { articleRef, siteRef } from '@/mocks/core/read-models'
import { csv } from '@/mocks/files'
import { locationMap, STOCK_TYPES } from './common'

/** Stock math (SPEC §6.7/§6.8, SPEC_RESOLUTIONS #18) — port of core `stock_math.py`. */

export const DEMAND_STATUSES = new Set<ServiceRequestStatus>([
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
const STOCK_STATUSES = new Set(['available', 'assigned', 'prepared'])

export function orderQty(demand: number, stock: number, buffer: number): number {
  return Math.max(0, demand + buffer - stock)
}

export function inDemand(sr: {
  status: ServiceRequestStatus
  resumeStatus: ServiceRequestStatus | null
}) {
  return (
    DEMAND_STATUSES.has(sr.status) ||
    (sr.status === 'reschedule_needed' && sr.resumeStatus !== 'shipped')
  )
}

/** Full recompute into `article_site_settings` (the `stock.recalculate` job). */
export function recalculateStock(now = new Date().toISOString()) {
  const locations = locationMap()
  const stock = new Map<string, { goodsIn: number; staging: number; goodsOut: number }>()
  for (const asset of db.collection('assets').all()) {
    if (!asset.articleId || !STOCK_STATUSES.has(asset.status)) continue
    const location = locations.get(asset.locationId)
    if (!location?.siteId || !STOCK_TYPES.has(location.type)) continue
    const key = `${asset.articleId}:${location.siteId}`
    const entry = stock.get(key) ?? { goodsIn: 0, staging: 0, goodsOut: 0 }
    if (location.type === 'goods_in') entry.goodsIn++
    else if (location.type === 'staging') entry.staging++
    else entry.goodsOut++
    stock.set(key, entry)
  }
  const srs = new Map(
    db
      .collection('service_requests')
      .all()
      .map((sr) => [sr.id, sr]),
  )
  const demand = new Map<string, number>()
  for (const item of db.collection('service_request_items').all()) {
    if (!item.slot.startsWith('new_') || !item.articleId) continue
    const sr = srs.get(item.serviceRequestId)
    if (!sr?.supplyingSiteId || !inDemand(sr)) continue
    const key = `${item.articleId}:${sr.supplyingSiteId}`
    demand.set(key, (demand.get(key) ?? 0) + 1)
  }
  const settings = db.collection('article_site_settings')
  const articles = new Set<number>()
  const sites = new Set<number>()
  for (const row of settings.all()) {
    const key = `${row.articleId}:${row.siteId}`
    const s = stock.get(key) ?? { goodsIn: 0, staging: 0, goodsOut: 0 }
    articles.add(row.articleId)
    sites.add(row.siteId)
    settings.update(row.id, {
      stockGoodsIn: s.goodsIn,
      stockStaging: s.staging,
      stockGoodsOut: s.goodsOut,
      stockQty: s.goodsIn + s.staging + s.goodsOut,
      demandQty: demand.get(key) ?? 0,
      calculatedAt: now,
    })
  }
  return { articles: articles.size, sites: sites.size, calculatedAt: now }
}

export function stockCell(row: ArticleSiteSettingRow): StockCell {
  const stock = row.stockQty
  return {
    siteId: row.siteId,
    goodsIn: row.stockGoodsIn,
    staging: row.stockStaging,
    goodsOut: row.stockGoodsOut,
    stock,
    demand: row.demandQty,
    buffer: row.bufferQty,
    orderQty: orderQty(row.demandQty, stock, row.bufferQty),
    minQty: row.minQty,
    maxQty: row.maxQty,
    belowMin: row.minQty !== null && stock < row.minQty,
    aboveMax: row.maxQty !== null && stock > row.maxQty,
    lastOrderDate: row.lastOrderDate,
    lastOrderedQty: row.lastOrderedQty,
  }
}

export interface MatrixParams {
  siteIds: number[]
  categories: ArticleCategory[]
  q: string
  onlyShortfall: boolean
  includeInactive: boolean
}

export function hubs() {
  return db
    .collection('sites')
    .filter((site) => site.kind === 'hub' && site.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
}

function shortfall(cell: StockCell): boolean {
  return cell.orderQty > 0 || cell.demand > cell.stock
}

/** Selected hubs or `{ unknown }` for 422. */
export function selectedHubs(siteIds: number[]) {
  const all = hubs()
  if (siteIds.length === 0) return { sites: all, unknown: [] as number[] }
  const ids = new Set(all.map((s) => s.id))
  return {
    sites: all.filter((s) => siteIds.includes(s.id)),
    unknown: siteIds.filter((id) => !ids.has(id)),
  }
}

export function matrixRows(params: MatrixParams) {
  const { sites } = selectedHubs(params.siteIds)
  const order = new Map(sites.map((s, i) => [s.id, i]))
  const articles = new Map(
    db
      .collection('articles')
      .all()
      .map((a) => [a.id, a]),
  )
  const q = params.q.trim().toLowerCase()
  const grouped = new Map<number, ArticleSiteSettingRow[]>()
  for (const row of db.collection('article_site_settings').all()) {
    if (!order.has(row.siteId)) continue
    const article = articles.get(row.articleId)
    if (!article) continue
    if (!params.includeInactive && !article.isActive) continue
    if (params.categories.length && !params.categories.includes(article.category)) continue
    if (
      q &&
      ![article.number, article.name, article.internalDescription, article.modelNumber].some(
        (value) => value.toLowerCase().includes(q),
      )
    )
      continue
    grouped.set(row.articleId, [...(grouped.get(row.articleId) ?? []), row])
  }
  const rows = [...grouped.entries()]
    .map(([articleId, cells]) => ({
      article: articles.get(articleId)!,
      settings: cells.sort((a, b) => (order.get(a.siteId) ?? 0) - (order.get(b.siteId) ?? 0)),
    }))
    .sort((a, b) => a.article.number.localeCompare(b.article.number))
  return { sites, rows }
}

export function buildMatrix(params: MatrixParams, recalculating: boolean): StockMatrix {
  const { sites, rows } = matrixRows(params)
  const siteIds = new Set(sites.map((s) => s.id))
  let calculatedAt: string | null = null
  const out: StockMatrix['rows'] = []
  for (const { article, settings } of rows) {
    const cells = settings.map(stockCell)
    for (const s of settings) {
      if (s.calculatedAt && (!calculatedAt || s.calculatedAt > calculatedAt))
        calculatedAt = s.calculatedAt
    }
    if (params.onlyShortfall && !cells.some(shortfall)) continue
    out.push({
      article: { ...articleRef(article.id)!, isActive: article.isActive },
      cells,
      totals: {
        stock: cells.reduce((sum, c) => sum + c.stock, 0),
        demand: cells.reduce((sum, c) => sum + c.demand, 0),
        orderQty: cells.reduce((sum, c) => sum + c.orderQty, 0),
      },
    })
  }
  if (!calculatedAt) {
    for (const s of db.collection('article_site_settings').all()) {
      if (s.calculatedAt && (!calculatedAt || s.calculatedAt > calculatedAt))
        calculatedAt = s.calculatedAt
    }
  }
  return {
    calculatedAt,
    sites: sites.map((s) => siteRef(s.id)!),
    rows: out,
    meta: {
      unmatchedDemand: unmatchedDemand().filter((u) => u.siteId === null || siteIds.has(u.siteId)),
      unresolvedDemand: unresolvedDemand(),
      recalculating,
    },
  }
}

export function unmatchedDemand() {
  const srs = new Map(
    db
      .collection('service_requests')
      .all()
      .map((sr) => [sr.id, sr]),
  )
  const counts = new Map<string, { requestedType: string; siteId: number | null; count: number }>()
  for (const item of db.collection('service_request_items').all()) {
    if (!item.slot.startsWith('new_') || item.articleId !== null) continue
    const sr = srs.get(item.serviceRequestId)
    if (!sr || !(DEMAND_STATUSES.has(sr.status) || sr.status === 'reschedule_needed')) continue
    const key = `${item.requestedType}:${sr.supplyingSiteId}`
    const entry = counts.get(key) ?? {
      requestedType: item.requestedType ?? '—',
      siteId: sr.supplyingSiteId,
      count: 0,
    }
    entry.count++
    counts.set(key, entry)
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
}

export function unresolvedDemand(): number {
  const srs = new Map(
    db
      .collection('service_requests')
      .all()
      .map((sr) => [sr.id, sr]),
  )
  return db.collection('service_request_items').count((item) => {
    if (!item.slot.startsWith('new_')) return false
    const sr = srs.get(item.serviceRequestId)
    return sr?.supplyingSiteId === null && inDemand(sr)
  })
}

export function exportMatrixCsv(params: MatrixParams): string {
  const { sites, rows } = matrixRows(params)
  const header = [
    'Hub',
    'Article number',
    'Article',
    'Model number',
    'Device type',
    'Goods in',
    'Staging',
    'Goods out',
    'Stock',
    'Demand',
    'Buffer',
    'Order qty',
    'Min',
    'Max',
    'Last order date',
  ]
  const lines: (string | number | null)[][] = []
  for (const site of sites) {
    for (const { article, settings } of rows) {
      const setting = settings.find((s) => s.siteId === site.id)
      if (!setting) continue
      const cell = stockCell(setting)
      if (params.onlyShortfall && !shortfall(cell)) continue
      lines.push([
        site.name,
        article.number,
        article.name,
        article.modelNumber,
        article.internalDescription,
        cell.goodsIn,
        cell.staging,
        cell.goodsOut,
        cell.stock,
        cell.demand,
        cell.buffer,
        cell.orderQty,
        cell.minQty,
        cell.maxQty,
        cell.lastOrderDate,
      ])
    }
  }
  return csv([header, ...lines])
}
