import type { Trigger } from '@/lib/api/types'
import { db } from '@/mocks/db'
import { defaultSettings, type DispatchSettingsRow, type MailLogRow } from './tables'
import { renderMail, type MailContext } from './templates'

/**
 * The mock's `notify()` + `notifications.send` + mail-log subscriber in one step: the demo has
 * no worker, so a queued mail is rendered and logged as sent immediately (same row shape as
 * the backend's `mail_log`).
 */

export const ESCALATION_CC = 'fleet-escalations@example.com'

export function settings(): DispatchSettingsRow {
  return db.collection('dispatch_settings').get(1) ?? defaultSettings(new Date().toISOString())
}

let sequence = 0

function notificationId(): string {
  sequence += 1
  const random = globalThis.crypto?.randomUUID?.()
  return random ?? `demo-${Date.now().toString(16)}-${sequence.toString(16).padStart(4, '0')}`
}

export function queueMail(input: {
  templateId: string
  to: string[]
  cc?: string[]
  /** Subject already rendered by the sender (other slices' mails via core `notify()`). */
  subject?: string | null
  context: MailContext
  entity: { type: string; id: number; label: string } | null
  trigger: Trigger
  actorId: number | null
  attachments?: number[]
}): MailLogRow | null {
  const to = input.to.filter(Boolean)
  if (to.length === 0) return null
  const rendered = renderMail(input.templateId, input.context)
  const now = new Date().toISOString()
  return db.collection('mail_log').insert({
    notificationId: notificationId(),
    templateId: input.templateId,
    status: 'sent',
    toAddresses: to,
    ccAddresses: [...new Set((input.cc ?? []).filter(Boolean))],
    subject: input.subject ?? rendered.subject,
    bodyHtml: rendered.html,
    bodyText: rendered.text,
    entityType: input.entity?.type ?? null,
    entityId: input.entity?.id ?? null,
    entityLabel: input.entity?.label ?? null,
    attachmentFileIds: input.attachments ?? [],
    messageId: `<demo-${Date.now()}@mail.example.com>`,
    error: null,
    trigger: input.trigger,
    triggeredBy: input.actorId,
    queuedAt: now,
    sentAt: now,
    createdAt: now,
    updatedAt: now,
  })
}
