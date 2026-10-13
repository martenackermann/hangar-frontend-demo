import type { EntityRef } from '@/lib/api/types'
import { notify, type MailOutboxRow } from '@/mocks/core/notify'

/**
 * Mails queued by H5 actions in demo mode (`calloff.order`, `inventory.report`) go through the
 * mock core `notify()` (`mail_outbox`, subscribers such as H1's mail log), like the real API's
 * core `notify()`.
 */
export function notifyMock(input: {
  templateId: 'calloff.order' | 'inventory.report'
  subject: string
  to: string[]
  cc: string[]
  entity: EntityRef
  attachments: number[]
  actorId: number | null
}): MailOutboxRow | null {
  return notify({
    templateId: input.templateId,
    subject: input.subject,
    to: input.to,
    cc: input.cc,
    entity: input.entity,
    attachments: input.attachments,
    trigger: 'user',
    actorId: input.actorId,
  })
}
