import { describe, expect, it, vi } from 'vitest'
import { db } from '@/mocks/db'
import { notify, onNotificationQueued } from './notify'

describe('mock core notify()', () => {
  it('queues example.com recipients in mail_outbox and tells the subscribers', () => {
    const seen = vi.fn()
    onNotificationQueued(seen)
    const row = notify({
      templateId: 'calloff.order',
      to: ['partner-orders@example.com', 'someone@elsewhere.test', null],
      cc: ['rollout-team@example.com', 'partner-orders@example.com'],
      entity: { type: 'calloff_order', id: 7, label: 'CO-7' },
      attachments: [1, 2],
      actorId: 3,
    })
    expect(row?.to).toEqual(['partner-orders@example.com'])
    expect(row?.cc).toEqual(['rollout-team@example.com'])
    expect(db.collection('mail_outbox').all()).toContainEqual(row)
    expect(seen).toHaveBeenCalledWith(row)
  })

  it('drops a mail without recipients', () => {
    expect(notify({ templateId: 'x', to: ['nobody@elsewhere.test'] })).toBeNull()
  })
})
