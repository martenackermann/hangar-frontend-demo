import type { CallOffLine, CallOffOrder, CallOffOrderSummary } from '@/lib/api/types'
import { businessToday } from '@/lib/format'
import type { MockActor } from '@/mocks/auth'
import { db } from '@/mocks/db'
import type { ArticleSiteSettingRow } from '@/mocks/fixtures/types'
import { articleRef, siteRef, userRef } from '@/mocks/core/read-models'
import { csv, simplePdf, storeFile, type StoredFileRow } from '@/mocks/files'
import { compact, docDate, docDateTime } from './common'
import { orderQty } from './stock'
import type { CallOffOrderLineRow, CallOffOrderRow } from './tables'

/** Call-off orders (SPEC §4.8, §6.8) — port of `services/calloff.py`. */

export const PARTNER_MAILBOX = 'partner-orders@example.com'
export const TEAM_MAILBOX = 'rollout-team@example.com'

export function settingsOf(siteId: number): Map<number, ArticleSiteSettingRow> {
  return new Map(
    db
      .collection('article_site_settings')
      .filter((s) => s.siteId === siteId)
      .map((s) => [s.articleId, s]),
  )
}

export function linesOf(orderId: number): CallOffOrderLineRow[] {
  const articles = new Map(
    db
      .collection('articles')
      .all()
      .map((a) => [a.id, a.number]),
  )
  return db
    .collection('calloff_order_lines')
    .filter((line) => line.calloffOrderId === orderId)
    .sort((a, b) =>
      (articles.get(a.articleId) ?? '').localeCompare(articles.get(b.articleId) ?? ''),
    )
}

export function nextNumber(siteCode: string, day: string): string {
  const prefix = `CO-${siteCode}-${compact(day)}-`
  const taken = new Set(
    db
      .collection('calloff_orders')
      .filter((o) => o.number.startsWith(prefix))
      .map((o) => Number(o.number.slice(prefix.length))),
  )
  let seq = 1
  while (taken.has(seq)) seq++
  return `${prefix}${String(seq).padStart(2, '0')}`
}

export function lineFromSetting(
  orderId: number,
  setting: ArticleSiteSettingRow,
  quantity?: number,
): Omit<CallOffOrderLineRow, 'id'> {
  const suggested = orderQty(setting.demandQty, setting.stockQty, setting.bufferQty)
  return {
    calloffOrderId: orderId,
    articleId: setting.articleId,
    demandQty: setting.demandQty,
    stockQty: setting.stockQty,
    bufferQty: setting.bufferQty,
    suggestedQty: suggested,
    quantity: quantity ?? suggested,
  }
}

export function sendFailure(order: CallOffOrderRow): { code: string; message: string } | null {
  if (!linesOf(order.id).some((line) => line.quantity > 0))
    return { code: 'no_lines', message: 'Add at least one line with a quantity above zero.' }
  if (order.deliveryDate < businessToday())
    return {
      code: 'delivery_date_past',
      message: 'The delivery date is in the past. Choose a new date.',
    }
  return null
}

export function summary(order: CallOffOrderRow): CallOffOrderSummary {
  const lines = linesOf(order.id)
  return {
    id: order.id,
    number: order.number,
    site: siteRef(order.siteId)!,
    status: order.status,
    deliveryDate: order.deliveryDate,
    lineCount: lines.filter((l) => l.quantity > 0).length,
    totalQuantity: lines.reduce((sum, l) => sum + l.quantity, 0),
    recipientEmail: order.recipientEmail,
    createdBy: userRef(order.createdBy)!,
    createdAt: order.createdAt,
    sentAt: order.sentAt,
    sentBy: userRef(order.sentBy),
  }
}

export function detail(order: CallOffOrderRow, actor: MockActor | null): CallOffOrder {
  const settings = settingsOf(order.siteId)
  const warnings: string[] = []
  const lines: CallOffLine[] = linesOf(order.id).map((line) => {
    const setting = settings.get(line.articleId)
    const lineWarnings: CallOffLine['warnings'] = []
    if (setting?.minQty != null && line.stockQty + line.quantity < setting.minQty)
      lineWarnings.push('below_min')
    if (setting?.maxQty != null && line.stockQty + line.quantity > setting.maxQty)
      lineWarnings.push('above_max')
    for (const w of lineWarnings) if (!warnings.includes(w)) warnings.push(w)
    return {
      id: line.id,
      article: articleRef(line.articleId)!,
      demandQty: line.demandQty,
      stockQty: line.stockQty,
      bufferQty: line.bufferQty,
      suggestedQty: line.suggestedQty,
      quantity: line.quantity,
      minQty: setting?.minQty ?? null,
      maxQty: setting?.maxQty ?? null,
      warnings: lineWarnings,
    }
  })
  if (!lines.some((l) => l.quantity > 0)) warnings.push('zero_lines')
  if (order.status === 'draft' && order.deliveryDate < businessToday())
    warnings.push('delivery_date_past')
  const actions: string[] = []
  if (order.status === 'draft' && actor?.permissions.includes('calloff.manage')) {
    if (!sendFailure(order)) actions.push('send')
    actions.push('cancel')
  }
  return {
    ...summary(order),
    note: order.note,
    lines,
    warnings,
    availableActions: actions,
    version: order.version,
    mailLogEntityRef: { type: 'calloff_order', id: order.id, label: order.number },
  }
}

/**
 * Order documents. The demo has no XLSX writer, so "xlsx" is a CSV spreadsheet with the same
 * columns (`.csv`); the PDF is a one-page summary.
 */
export function storeDocuments(
  order: CallOffOrderRow,
  actorId: number | null,
  ttlHours: number | null,
): { xlsx: StoredFileRow; pdf: StoredFileRow } {
  const site = db.collection('sites').get(order.siteId)
  const lines = linesOf(order.id).filter((l) => l.quantity > 0)
  const articles = new Map(
    db
      .collection('articles')
      .all()
      .map((a) => [a.id, a]),
  )
  const table = [
    [
      'Article number',
      'External part no.',
      'Name',
      'Model number',
      'Quantity',
      'Demand',
      'Stock',
      'Buffer',
    ],
    ...lines.map((l) => {
      const a = articles.get(l.articleId)
      return [
        a?.number,
        a?.externalPartNumber,
        a?.name,
        a?.modelNumber,
        l.quantity,
        l.demandQty,
        l.stockQty,
        l.bufferQty,
      ]
    }),
  ]
  const entity = { type: 'calloff_order' as const, id: order.id }
  const xlsx = storeFile({
    filename: `${order.number}.csv`,
    contentType: 'text/csv',
    body: csv(table),
    purpose: 'calloff_document',
    entity,
    actorId,
    ttlHours,
  })
  const total = lines.reduce((sum, l) => sum + l.quantity, 0)
  const pdf = storeFile({
    filename: `${order.number}.pdf`,
    contentType: 'application/pdf',
    body: simplePdf([
      {
        title: `Call-off order ${order.number}`,
        lines: [
          'Acme IT Services - on behalf of Globex Fleet AG',
          `To Initech Logistics <${order.recipientEmail}>`,
          `Deliver to ${site?.name ?? ''}, ${site?.street ?? ''}, ${site?.zip ?? ''} ${site?.city ?? ''}`,
          `Delivery date ${docDate(order.deliveryDate)}`,
          `Sent ${order.sentAt ? docDateTime(order.sentAt) : 'not sent yet'}`,
          '',
          ...lines.map((l) => {
            const a = articles.get(l.articleId)
            return `${a?.number ?? ''}  ${a?.name ?? ''} (${a?.modelNumber ?? ''})  x ${l.quantity}`
          }),
          '',
          `Total ${total}`,
          ...(order.note ? ['', `Note: ${order.note}`] : []),
          '',
          'This is a demo system; all names and addresses are fictional.',
        ],
      },
    ]),
    purpose: 'calloff_document',
    entity,
    actorId,
    ttlHours,
  })
  return { xlsx, pdf }
}

export const ACTION_TITLES = { send: 'Send to Initech Logistics', cancel: 'Cancel order' }
