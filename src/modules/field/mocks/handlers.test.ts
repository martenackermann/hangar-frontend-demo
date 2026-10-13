import { describe, expect, it } from 'vitest'
import { api } from '@/lib/api/client'
import { isApiError } from '@/lib/api/errors'
import type {
  Appointment,
  BookingCalendar,
  DeploymentView,
  DownloadLink,
  List,
  ScanResult,
  ServiceRequestDetail,
  ServiceRequestItem,
  TourCandidates,
  TourDetail,
  TourPlannerOverview,
} from '@/lib/api/types'
import { businessToday } from '@/lib/format'
import { db } from '@/mocks/db'
import { PERSONA_EMAILS, signInAs } from '@/test/utils'
import { anchorDay } from './model'

async function failure(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (isApiError(error)) return error
    throw error
  }
  throw new Error('expected the request to fail')
}

async function theosTour(): Promise<TourDetail> {
  await signInAs(PERSONA_EMAILS.technician)
  const date = anchorDay(businessToday())
  const tours = await api.get<List<TourDetail>>(`/my/tours?date=${date}`)
  const tour = tours.data[0]
  if (!tour) throw new Error('Theo has no tour')
  return tour
}

describe('H4 seed (SPEC §11.6)', () => {
  it('derives calendars, appointments and tours from the core rows', () => {
    expect(db.collection('booking_calendars').count()).toBe(9)
    expect(db.collection('appointments').count((a) => a.serviceRequestId === null)).toBe(5)
    const withAppointment = db
      .collection('service_requests')
      .count((sr) => sr.appointmentStartAt !== null)
    expect(db.collection('appointments').count((a) => a.isCurrent)).toBe(withAppointment)
    expect(db.collection('tours').count()).toBeGreaterThan(20)
  })

  it("gives Theo today's Riverton tour with 5 pending stops", async () => {
    const tour = await theosTour()
    expect(tour.calendar.name).toBe('Riverton route')
    expect(tour.pendingCount).toBe(5)
    expect(tour.stops.every((s) => s.readiness === 'ready')).toBe(true)
  })
})

describe('H4 endpoints', () => {
  it('lists calendars and patches them as admin only', async () => {
    await signInAs(PERSONA_EMAILS.viewer)
    const calendars = await api.get<List<BookingCalendar>>('/booking-calendars')
    expect(calendars.data).toHaveLength(9)
    expect((await failure(api.patch('/booking-calendars/1', { isEnabled: false }))).status).toBe(
      403,
    )
    await signInAs(PERSONA_EMAILS.admin)
    const patched = await api.patch<BookingCalendar>('/booking-calendars/1', { isEnabled: false })
    expect(patched.isEnabled).toBe(false)
  })

  it('links an unmatched appointment', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const unmatched = await api.get<List<Appointment>>('/appointments?unmatched=true')
    expect(unmatched.data).toHaveLength(5)
    const sr = db.collection('service_requests').find((s) => s.status === 'invited')
    const first = unmatched.data[0]
    if (!sr || !first) throw new Error('fixture')
    const linked = await api.post<Appointment>(`/appointments/${first.id}/link`, {
      serviceRequestNumber: sr.number,
    })
    expect(linked.serviceRequest?.status).toBe('appointment_booked')
    expect(
      (
        await failure(
          api.post(`/appointments/${first.id}/link`, { serviceRequestNumber: sr.number }),
        )
      ).status,
    ).toBe(409)
  })

  it('serves the planner overview and candidates', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const overview = await api.get<TourPlannerOverview>('/tour-planner/overview')
    expect(overview.days).toHaveLength(5)
    expect(overview.rows).toHaveLength(9)
    const tour = await theosTour()
    const candidates = await api.get<TourCandidates>(
      `/tour-planner/candidates?calendarId=${tour.calendar.id}&date=${tour.tourDate}`,
    )
    expect(candidates.tour?.id).toBe(tour.id)
    expect(candidates.candidates.filter((c) => c.inTourId === tour.id)).toHaveLength(5)
  })

  it('runs a deployment: scans, completion, protocol', async () => {
    const tour = await theosTour()
    const stop = tour.stops[0]
    if (!stop) throw new Error('no stop')
    const view = await api.get<DeploymentView>(`/tours/${tour.id}/stops/${stop.id}/deployment`)
    expect(view.serviceRequest.blockedActions.map((b) => b.guard)).toContain(
      'deployment_scans_complete',
    )
    for (const item of view.serviceRequest.items) {
      const value = item.asset?.assetTag ?? item.asset?.serialNumber ?? item.expectedAssetTag
      if (!value || (item.direction === 'deliver' && !item.asset)) continue
      const result = await api.post<ScanResult<ServiceRequestItem>>('/scan/deployment', {
        serviceRequestId: view.serviceRequest.id,
        serial: value.toLowerCase(),
      })
      expect(['new_verified', 'old_verified']).toContain(result.code)
    }
    const repeat = await api.post<ScanResult<ServiceRequestItem>>('/scan/deployment', {
      serviceRequestId: view.serviceRequest.id,
      serial: view.serviceRequest.items[0]?.asset?.serialNumber ?? 'X',
    })
    expect(repeat.code).toBe('already_verified')
    const unknown = await api.post<ScanResult<ServiceRequestItem>>('/scan/deployment', {
      serviceRequestId: view.serviceRequest.id,
      serial: 'NOT-A-DEVICE',
    })
    expect(unknown).toMatchObject({ verdict: 'warning', code: 'unknown_device', canRegister: true })
    expect(db.collection('tours').get(tour.id)?.status).toBe('in_progress')

    const missing = await failure(
      api.post(`/service-requests/${view.serviceRequest.id}/actions/complete_deployment`, {
        handoverConfirmed: true,
      }),
    )
    expect(missing.status).toBe(422)
    const done = await api.post<ServiceRequestDetail>(
      `/service-requests/${view.serviceRequest.id}/actions/complete_deployment`,
      { recipientName: 'Test Recipient', handoverConfirmed: true },
    )
    expect(done.status).toBe('completed')
    expect(done.protocolAvailable).toBe(true)
    const stopRow = db.collection('tour_stops').get(stop.id)
    expect(stopRow?.outcome).toBe('completed')
  })

  it('refuses another technician and reschedules on site', async () => {
    const tour = await theosTour()
    const stop = tour.stops[1]
    if (!stop) throw new Error('no stop')
    await signInAs('tara.lindqvist@example.com')
    const denied = await failure(
      api.post(`/service-requests/${stop.serviceRequest.id}/actions/reschedule_on_site`, {
        deviationCodeId: 4,
      }),
    )
    expect(denied.code).toBe('not_own_tour')
    await signInAs(PERSONA_EMAILS.technician)
    const wrong = await failure(
      api.post(`/service-requests/${stop.serviceRequest.id}/actions/reschedule_on_site`, {
        deviationCodeId: 15,
        deviationComment: 'x',
      }),
    )
    expect(wrong.guard?.code).toBe('deviation_outcome')
    const done = await api.post<ServiceRequestDetail>(
      `/service-requests/${stop.serviceRequest.id}/actions/reschedule_on_site`,
      { deviationCodeId: 4 },
    )
    expect(done.status).toBe('reschedule_needed')
    expect(done.resumeStatus).toBe('ready_for_picking')
    expect(db.collection('tour_stops').get(stop.id)?.outcome).toBe('rescheduled')
  })

  it('serves the protocol PDF of a completed request', async () => {
    await signInAs(PERSONA_EMAILS.viewer)
    const sr = db.collection('service_requests').find((s) => s.status === 'completed')
    if (!sr) throw new Error('fixture')
    const link = await api.get<DownloadLink>(`/service-requests/${sr.id}/protocol`)
    expect(link.contentType).toBe('application/pdf')
    const response = await fetch(link.url)
    expect(response.status).toBe(200)
    expect((await response.text()).startsWith('%PDF')).toBe(true)
  })
})
