import { describe, expect, it } from 'vitest'
import { actorForUser } from './auth'
import { servedEnums } from './core/fixture'
import { srDetail } from './core/read-models'
import { db } from './db'
import { problemInfo } from './http'
import { applyAction, applyBulk, evaluateActions, registerGuard } from './workflow'

function actor(email: string) {
  const user = db.collection('users').find((u) => u.email === email)
  if (!user) throw new Error(`no user ${email}`)
  return actorForUser(user)
}

const dana = () => actor('dana.dispatcher@example.com')
const vic = () => actor('vic.viewer@example.com')
const firstSr = (status: string) => {
  const sr = db.collection('service_requests').find((row) => row.status === status)
  if (!sr) throw new Error(`no SR in ${status}`)
  return sr
}

describe('transition maps (SPEC §4, served by /meta/enums)', () => {
  it('every action targets a known status and names a known permission', () => {
    const statuses = new Set(servedEnums().serviceRequestStatus.map((s) => s.value))
    const permissions = new Set(servedEnums().permissions.map((p) => p.key))
    for (const def of servedEnums().transitions.serviceRequest) {
      for (const from of def.from)
        expect(statuses.has(from), `${def.action} from ${from}`).toBe(true)
      if (def.to) expect(statuses.has(def.to), `${def.action} to ${def.to}`).toBe(true)
      if (def.permission) expect(permissions.has(def.permission), def.action).toBe(true)
    }
    expect(servedEnums().transitions.serviceRequest.find((d) => d.action === 'claim')?.bulk).toBe(
      false,
    )
  })

  it('computes availableActions per role (viewers get none)', () => {
    const sr = firstSr('appointment_booked')
    expect(evaluateActions('serviceRequest', sr, dana()).availableActions).toContain('claim')
    expect(evaluateActions('serviceRequest', sr, vic()).availableActions).toEqual([])
  })

  it('applies claim → release with effects, history row and version bump', () => {
    const sr = firstSr('appointment_booked')
    const claimed = applyAction('serviceRequest', sr.id, 'claim', { actor: dana() })
    expect(claimed.ok).toBe(true)
    const row = db.collection('service_requests').get(sr.id)
    expect(row?.status).toBe('personalization_in_progress')
    expect(row?.editorUserId).toBe(dana().id)
    expect(row?.version).toBe(sr.version + 1)
    const history = db
      .collection('status_transitions')
      .filter((t) => t.entityId === sr.id && t.action === 'claim')
    expect(history).toHaveLength(1)

    const released = applyAction('serviceRequest', sr.id, 'release', { actor: dana() })
    expect(released.ok).toBe(true)
    expect(db.collection('service_requests').get(sr.id)?.editorUserId).toBeNull()
  })

  it('rejects wrong status (409 + allowedActions), permission (403), version (409) and missing comment (422)', () => {
    const sr = firstSr('imported')
    const wrongStatus = applyAction('serviceRequest', sr.id, 'close_order', { actor: dana() })
    expect(wrongStatus.ok).toBe(false)
    if (!wrongStatus.ok) {
      expect(wrongStatus.response.status).toBe(409)
      expect(problemInfo(wrongStatus.response).code).toBe('transition_not_allowed')
    }
    const forbidden = applyAction('serviceRequest', sr.id, 'cancel', {
      actor: vic(),
      payload: { comment: 'x' },
    })
    expect(!forbidden.ok && forbidden.response.status).toBe(403)
    const stale = applyAction('serviceRequest', sr.id, 'cancel', {
      actor: dana(),
      payload: { comment: 'x', version: sr.version + 5 },
    })
    expect(!stale.ok && problemInfo(stale.response).code).toBe('version_conflict')
    const noComment = applyAction('serviceRequest', sr.id, 'cancel', { actor: dana() })
    expect(!noComment.ok && noComment.response.status).toBe(422)
  })

  it('reports failing guards as blockedActions and 409 guard_failed', () => {
    const sr = firstSr('personalization_done')
    registerGuard('serviceRequest', 'close_order', () => ({
      code: 'test_guard',
      message: 'Blocked by a test guard.',
    }))
    const { blockedActions } = evaluateActions(
      'serviceRequest',
      db.collection('service_requests').get(sr.id) ?? sr,
      dana(),
    )
    expect(blockedActions).toContainEqual({
      action: 'close_order',
      guard: expect.any(String) as string,
      reason: expect.any(String) as string,
    })
    const result = applyAction('serviceRequest', sr.id, 'close_order', { actor: dana() })
    expect(!result.ok && problemInfo(result.response).code).toBe('guard_failed')
  })

  it('treats backend conditions as from-rules: re-claiming your own request is 409 transition_not_allowed', () => {
    const sr = firstSr('appointment_booked')
    expect(applyAction('serviceRequest', sr.id, 'claim', { actor: dana() }).ok).toBe(true)
    const claimed = db.collection('service_requests').get(sr.id) ?? sr
    const { availableActions, blockedActions } = evaluateActions('serviceRequest', claimed, dana())
    expect(availableActions).not.toContain('claim')
    expect(blockedActions.map((b) => b.action)).not.toContain('claim')
    const again = applyAction('serviceRequest', sr.id, 'claim', { actor: dana() })
    expect(!again.ok && problemInfo(again.response).code).toBe('transition_not_allowed')
    // someone else may take it over
    const ada = actor('ada.admin@example.com')
    expect(evaluateActions('serviceRequest', claimed, ada).availableActions).toContain('claim')
  })

  it('cancels with released assets and summarises bulk actions', () => {
    const sr = firstSr('ready_for_picking')
    const result = applyAction('serviceRequest', sr.id, 'cancel', {
      actor: dana(),
      payload: { comment: 'Ordered twice' },
    })
    expect(result.ok).toBe(true)
    const detail = srDetail(db.collection('service_requests').get(sr.id) ?? sr, dana())
    expect(detail.status).toBe('cancelled')
    expect(
      detail.items.filter((i) => i.direction === 'deliver').every((i) => i.asset === null),
    ).toBe(true)

    const imported = db
      .collection('service_requests')
      .filter((row) => row.status === 'imported')
      .slice(0, 2)
    const bulk = applyBulk(
      'serviceRequest',
      'mark_hardware_unavailable',
      imported.map((r) => r.id),
      { actor: dana() },
    )
    expect(bulk).not.toBeInstanceOf(Response)
    if (!(bulk instanceof Response))
      expect(bulk.succeeded.length + bulk.failed.length).toBe(imported.length)
  })
})
