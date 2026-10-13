import { describe, expect, it } from 'vitest'
import { api } from '@/lib/api/client'
import { isApiError } from '@/lib/api/errors'
import type {
  DispatchRun,
  DispatchSettings,
  HistoryEntry,
  JobAccepted,
  LeaseReturnDetail,
  List,
  MailLogDetail,
  MailLogEntry,
  Page,
  ServiceRequestDetail,
  ServiceRequestListItem,
} from '@/lib/api/types'
import { db } from '@/mocks/db'
import { PERSONA_EMAILS, signInAs } from '@/test/utils'
import type { PipelineSummaryExt } from '../api'

async function failure(call: Promise<unknown>) {
  try {
    await call
  } catch (error) {
    if (isApiError(error)) return error
    throw error
  }
  throw new Error('expected the call to fail')
}

describe('H1 mock API', () => {
  it('lists open, non-VIP service requests by default and filters by stage', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const page = await api.get<Page<ServiceRequestListItem>>('/service-requests', {
      query: { perPage: 200 },
    })
    expect(page.data.every((sr) => !sr.isVip)).toBe(true)
    expect(page.data.some((sr) => ['completed', 'cancelled'].includes(sr.status))).toBe(false)
    const invited = await api.get<Page<ServiceRequestListItem>>('/service-requests', {
      query: { stage: 'invited', perPage: 200 },
    })
    expect(invited.data.every((sr) => sr.stage === 'invited')).toBe(true)
    const vip = await api.get<Page<ServiceRequestListItem>>('/service-requests', {
      query: { vip: 'only' },
    })
    expect(vip.data.every((sr) => sr.isVip)).toBe(true)
    const bad = await failure(api.get('/service-requests', { query: { status: 'nope' } }))
    expect(bad.status).toBe(422)
  })

  it('sends the next chain mail and logs it', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const sr = db
      .collection('service_requests')
      .find((row) => row.status === 'invited' && !row.isCampus && !row.isVip)
    expect(sr).toBeDefined()
    if (!sr) return
    const updated = await api.post<ServiceRequestDetail>(
      `/service-requests/${sr.id}/actions/send_next_mail`,
      {},
    )
    expect(updated.status).toBe('reminder_1_sent')
    const mails = await api.get<Page<MailLogEntry>>('/mail-log', {
      query: { entityType: 'service_request', entityId: sr.id },
    })
    expect(mails.data[0]?.templateId).toBe('sr.reminder_1')
    const detail = await api.get<MailLogDetail>(`/mail-log/${mails.data[0]?.id ?? 0}`)
    expect(detail.bodyHtml).toContain('Acme IT Services')
    const history = await api.get<List<HistoryEntry>>(`/service-requests/${sr.id}/history`)
    expect(history.data.some((entry) => entry.kind === 'mail')).toBe(true)
  })

  it('hides the first-mail variant that does not apply', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const campus = db
      .collection('service_requests')
      .find((row) => row.status === 'imported' && row.isCampus)
    const standard = db
      .collection('service_requests')
      .find((row) => row.status === 'imported' && !row.isCampus && !row.isVip)
    if (campus) {
      const detail = await api.get<ServiceRequestDetail>(`/service-requests/${campus.id}`)
      expect(detail.availableActions).not.toContain('send_invitation')
    }
    if (standard) {
      const detail = await api.get<ServiceRequestDetail>(`/service-requests/${standard.id}`)
      expect(detail.availableActions).not.toContain('send_campus_info')
      expect(detail.blockedActions.map((b) => b.action)).not.toContain('send_campus_info')
    }
  })

  it('unlinks lease returns when a request is cancelled', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const lease = db.collection('lease_returns').find((row) => {
      if (row.status !== 'replacement_ordered' || !row.serviceRequestId) return false
      const sr = db.collection('service_requests').get(row.serviceRequestId)
      return sr !== undefined && !['completed', 'cancelled'].includes(sr.status)
    })
    expect(lease).toBeDefined()
    if (!lease?.serviceRequestId) return
    await api.post(`/service-requests/${lease.serviceRequestId}/actions/cancel`, {
      comment: 'Duplicate order',
    })
    const after = await api.get<LeaseReturnDetail>(`/lease-returns/${lease.id}`)
    expect(after.status).not.toBe('replacement_ordered')
    expect(after.serviceRequest).toBeNull()
  })

  it('validates pause dates and PATCH locks', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const sr = db.collection('service_requests').find((row) => row.status === 'invited')
    const staged = db
      .collection('service_requests')
      .find((row) => row.status === 'ready_for_picking')
    if (!sr || !staged) throw new Error('fixture misses statuses')
    const past = await failure(
      api.post(`/service-requests/${sr.id}/actions/pause_communication`, {
        reason: 'x',
        resumeDate: '2020-01-01',
      }),
    )
    expect(past.status).toBe(422)
    const locked = await failure(
      api.patch(`/service-requests/${staged.id}`, { costCenter: 'CC-1234' }),
    )
    expect(locked.status).toBe(409)
    const ok = await api.patch<ServiceRequestDetail>(`/service-requests/${staged.id}`, {
      note: 'Call first',
    })
    expect(ok.note).toBe('Call first')
  })

  it('runs a dry run and a real dispatch run', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const dry = await api.post<DispatchRun>('/comms/dispatch-runs', { dryRun: true })
    expect(dry.dryRun).toBe(true)
    expect(dry.status).toBe('succeeded')
    expect(Array.isArray(dry.planned)).toBe(true)
    const accepted = await api.post<JobAccepted>('/comms/dispatch-runs', { dryRun: false })
    expect(accepted.dispatchRunId).toBeGreaterThan(0)
    const conflict = await failure(api.post('/comms/dispatch-runs', { dryRun: false }))
    expect(conflict.status).toBe(409)
  })

  it('serves settings with range validation and a pipeline summary', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const current = await api.get<DispatchSettings>('/dispatch-settings')
    const { updatedAt: _u, updatedBy: _b, nextScheduledRunAt: _n, ...input } = current
    void [_u, _b, _n]
    const bad = await failure(api.put('/dispatch-settings', { ...input, maxMailsPerRun: 0 }))
    expect(bad.fieldErrors.maxMailsPerRun).toBeDefined()
    const saved = await api.put<DispatchSettings>('/dispatch-settings', {
      ...input,
      srReminder1AfterDays: 3,
    })
    expect(saved.srReminder1AfterDays).toBe(3)
    const summary = await api.get<PipelineSummaryExt>('/pipeline/summary')
    expect(summary.stages).toHaveLength(8)
    expect(summary.trends?.days).toHaveLength(12)
    for (const stage of summary.stages) {
      const split = stage.aging
      expect(split.onTime + split.aging + split.overdue).toBe(stage.count)
    }
  })

  it('enforces permissions', async () => {
    await signInAs(PERSONA_EMAILS.viewer)
    const forbidden = await failure(api.post('/comms/dispatch-runs', { dryRun: true }))
    expect(forbidden.status).toBe(403)
    await signInAs(PERSONA_EMAILS.technician)
    const mail = await failure(api.get('/mail-log'))
    expect(mail.status).toBe(403)
  })
})
