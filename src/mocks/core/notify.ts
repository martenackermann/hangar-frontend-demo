import type { EntityRef, Trigger } from '@/lib/api/types'
import { db } from '@/mocks/db'

/**
 * The mock twin of the backend's `notify()` (SPEC §2.4 "Notifications"): slices queue a mail
 * here instead of keeping their own outbox. Every queued mail lands in `mail_outbox` (what
 * tests and the demo inspect) and is handed to the subscribers registered with
 * `onNotificationQueued`, the counterpart of the backend's `NotificationQueued` event (H1 turns
 * it into `mail_log` rows). The demo has no worker or SMTP, so nothing is actually sent.
 */
export interface QueuedMail {
  templateId: string
  /** Rendered subject when the caller already knows it (the backend renders it from the template). */
  subject: string | null
  to: string[]
  cc: string[]
  /** Template context, for subscribers that render the body. */
  context: Record<string, unknown>
  entity: EntityRef | null
  attachmentFileIds: number[]
  trigger: Trigger
  actorUserId: number | null
}

export interface MailOutboxRow extends QueuedMail {
  id: number
  queuedAt: string
}

declare module '@/mocks/db' {
  interface DemoCollections {
    mail_outbox: MailOutboxRow
  }
}

type Subscriber = (mail: MailOutboxRow) => void
const subscribers: Subscriber[] = []

/** Run `fn` for every queued mail (register once, from a slice's `mocks/workflow.ts`). */
export function onNotificationQueued(fn: Subscriber): void {
  subscribers.push(fn)
}

export interface NotifyInput {
  templateId: string
  to: readonly (string | null | undefined)[]
  cc?: readonly (string | null | undefined)[]
  subject?: string | null
  context?: Record<string, unknown>
  entity?: EntityRef | null
  attachments?: readonly number[]
  trigger?: Trigger
  actorId?: number | null
}

/**
 * Queue a mail. Like the backend in demo mode, only `@example.com` recipients are kept; a mail
 * without any recipient is dropped (returns null).
 */
export function notify(input: NotifyInput): MailOutboxRow | null {
  const keep = (list: readonly (string | null | undefined)[] = []) => [
    ...new Set(list.filter((a): a is string => !!a && a.toLowerCase().endsWith('@example.com'))),
  ]
  const to = keep(input.to)
  if (to.length === 0) return null
  const row = db.collection('mail_outbox').insert({
    templateId: input.templateId,
    subject: input.subject ?? null,
    to,
    cc: keep(input.cc).filter((a) => !to.includes(a)),
    context: input.context ?? {},
    entity: input.entity ?? null,
    attachmentFileIds: [...(input.attachments ?? [])],
    trigger: input.trigger ?? 'user',
    actorUserId: input.actorId ?? null,
    queuedAt: new Date().toISOString(),
  })
  for (const subscriber of subscribers) subscriber(row)
  return row
}
