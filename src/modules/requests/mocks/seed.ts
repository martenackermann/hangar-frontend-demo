import { addDays, toBusinessDate } from '@/lib/format'
import type { LeaseReturnRow, ServiceRequestRow } from '@/mocks/core/tables'
import type { SeedDefinition } from '@/mocks/db'
import { LEASE_TEMPLATE_BY_ACTION, SR_TEMPLATE_BY_ACTION } from './dispatch'
import { defaultSettings, type MailLogRow } from './tables'
import { leaseMailContext, renderMail, srMailContext } from './templates'

/**
 * H1 tables for the demo (SPEC §11, order 10). The backend export (`seed.json`
 * `tables.dispatch_settings|dispatch_runs|mail_log`) is loaded as-is by the database; only
 * when a table is missing this seed derives a consistent fallback from the core rows: one mail
 * per mail-implying status transition and the daily 07:00 runs of the last 14 days.
 */

const RESCHEDULE = new Set(['appointment_cancelled', 'request_reschedule', 'reschedule_on_site'])

function templateOf(
  entityType: string,
  action: string,
  payload: Record<string, unknown> | null,
  entity: ServiceRequestRow | LeaseReturnRow,
): string | null {
  if (entityType === 'lease_return') {
    const base = LEASE_TEMPLATE_BY_ACTION[action]
    return base ? (entity.isCampus ? `${base}_campus` : base) : null
  }
  if (SR_TEMPLATE_BY_ACTION[action]) return SR_TEMPLATE_BY_ACTION[action] ?? null
  if (action === 'mark_hardware_unavailable') return 'sr.hardware_unavailable'
  if (RESCHEDULE.has(action)) {
    if (action === 'request_reschedule' && payload?.notifyUser === false) return null
    return entity.isCampus ? 'sr.reschedule_campus' : 'sr.reschedule'
  }
  if (action === 'ship') return 'sr.shipping_confirmation'
  if (action === 'complete_deployment' && payload?.sendProtocol !== false) return 'sr.protocol'
  return null
}

export const seed: SeedDefinition = {
  module: 'requests',
  version: 1,
  order: 10,
  run: ({ db, faker, today }) => {
    const now = new Date().toISOString()
    if (db.collection('dispatch_settings').count() === 0) {
      db.collection('dispatch_settings').insert(defaultSettings(now))
    }

    if (db.collection('mail_log').count() === 0) {
      const transitions = [...db.collection('status_transitions').all()].sort(
        (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id - b.id,
      )
      const rows: Omit<MailLogRow, 'id'>[] = []
      for (const t of transitions) {
        const entity =
          t.entityType === 'service_request'
            ? db.collection('service_requests').get(t.entityId)
            : db.collection('lease_returns').get(t.entityId)
        if (!entity) continue
        const templateId = templateOf(t.entityType, t.action, t.payload, entity)
        const contact = entity.contactId
          ? db.collection('contacts').get(entity.contactId)
          : undefined
        if (!templateId || !contact?.email) continue
        const isSr = t.entityType === 'service_request'
        const rendered = renderMail(
          templateId,
          isSr
            ? srMailContext(entity as ServiceRequestRow)
            : leaseMailContext(entity as LeaseReturnRow),
        )
        const sentAt = new Date(
          Date.parse(t.occurredAt) + faker.number.int({ min: 20, max: 150 }) * 1000,
        ).toISOString()
        rows.push({
          notificationId: faker.string.uuid(),
          templateId,
          status: 'sent',
          toAddresses: [contact.email],
          ccAddresses:
            templateId === 'sr.escalation' || templateId.startsWith('lease.escalation')
              ? ['fleet-escalations@example.com']
              : [],
          subject: rendered.subject,
          bodyHtml: null,
          bodyText: rendered.text,
          entityType: t.entityType,
          entityId: entity.id,
          entityLabel: isSr
            ? (entity as ServiceRequestRow).number
            : (entity as LeaseReturnRow).assetTag,
          attachmentFileIds: [],
          messageId: `<seed-${rows.length + 1}@mail.example.com>`,
          error: null,
          trigger: t.trigger,
          triggeredBy: t.actorUserId,
          queuedAt: t.occurredAt,
          sentAt,
          createdAt: t.occurredAt,
          updatedAt: sentAt,
        })
      }
      db.collection('mail_log').insertMany(rows.map((row, index) => ({ ...row, id: index + 1 })))
    }

    if (db.collection('dispatch_runs').count() === 0) {
      const byDay = new Map<string, Record<string, number>>()
      for (const t of db.collection('status_transitions').all()) {
        if (t.trigger !== 'job') continue
        const entity =
          t.entityType === 'service_request'
            ? db.collection('service_requests').get(t.entityId)
            : db.collection('lease_returns').get(t.entityId)
        const template = entity ? templateOf(t.entityType, t.action, t.payload, entity) : null
        if (!template) continue
        const day = toBusinessDate(t.occurredAt)
        const counts = byDay.get(day) ?? {}
        counts[template] = (counts[template] ?? 0) + 1
        byDay.set(day, counts)
      }
      const runs = []
      for (let offset = 13; offset >= 0; offset -= 1) {
        const day = addDays(today, -offset)
        const counts = byDay.get(day)
        if (offset === 0 && !counts) continue
        const startedAt = `${day}T05:00:0${faker.number.int({ min: 2, max: 9 })}Z`
        const finishedAt = new Date(
          Date.parse(startedAt) + faker.number.int({ min: 14, max: 48 }) * 1000,
        ).toISOString()
        runs.push({
          id: runs.length + 1,
          backgroundJobId: null,
          trigger: 'job' as const,
          dryRun: false,
          status: 'succeeded' as const,
          startedAt,
          finishedAt,
          counts: counts ?? {},
          skipped: {},
          errors: [],
          planned: null,
          triggeredBy: null,
          createdAt: startedAt,
          updatedAt: finishedAt,
        })
      }
      db.collection('dispatch_runs').insertMany(runs)
    }
  },
}
