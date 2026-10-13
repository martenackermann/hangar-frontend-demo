import type { EntityRef } from '@/lib/api/types'
import { db } from '@/mocks/db'

/**
 * Mails queued by H5 actions in demo mode (`calloff.order`, `inventory.report`). The real API
 * calls core `notify()`, whose `NotificationQueued` event H1 turns into `mail_log` rows. The
 * mock core has no notify yet (shared-file request), so H5 keeps its own outbox; tests read it.
 */
export interface StockMailRow {
  id: number
  templateId: 'calloff.order' | 'inventory.report'
  subject: string
  to: string[]
  cc: string[]
  entityType: EntityRef['type']
  entityId: number
  entityLabel: string
  attachmentFileIds: number[]
  actorUserId: number | null
  queuedAt: string
}

declare module '@/mocks/db' {
  interface DemoCollections {
    stock_mail_outbox: StockMailRow
  }
}

export function notifyMock(input: {
  templateId: StockMailRow['templateId']
  subject: string
  to: string[]
  cc: string[]
  entity: EntityRef
  attachments: number[]
  actorId: number | null
}): StockMailRow {
  return db.collection('stock_mail_outbox').insert({
    templateId: input.templateId,
    subject: input.subject,
    to: input.to,
    cc: input.cc,
    entityType: input.entity.type,
    entityId: input.entity.id,
    entityLabel: input.entity.label,
    attachmentFileIds: input.attachments,
    actorUserId: input.actorId,
    queuedAt: new Date().toISOString(),
  })
}
