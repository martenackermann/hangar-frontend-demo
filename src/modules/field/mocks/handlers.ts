import { http, HttpResponse, type RequestHandler } from 'msw'
import type { DeploymentView, DeviationCode, SyncState, TourPlannerOverview } from '@/lib/api/types'
import { addDays, addWorkingDays, businessToday, toBusinessDate } from '@/lib/format'
import { authed } from '@/mocks/auth'
import {
  contactDetail,
  deviationCode,
  srDetail,
  srItem,
  srListItem,
  userRef,
} from '@/mocks/core/read-models'
import { setAppointment } from '@/mocks/core/workflow'
import { db } from '@/mocks/db'
import { downloadLink } from '@/mocks/files'
import { apiPath, intParam, listOf, problem, problems, readJson } from '@/mocks/http'
import { advanceJob, startJob } from '@/mocks/jobs'
import { filterIn, listResponse } from '@/mocks/list'
import { applyAction } from '@/mocks/workflow'
import {
  activeContext,
  canExecute,
  normalizeCode,
  registerUnknown,
  scanDeployment,
  undoVerification,
} from './deployment'
import {
  activeTour,
  appointmentDto,
  bookingCalendar,
  businessInstant,
  calendarRef,
  candidateRows,
  canExecuteTour,
  externalIdFor,
  onBusinessDay,
  PRE_APPT_STATUSES,
  readinessOf,
  setStopOrder,
  stopsOf,
  tourDetail,
  tourOfStop,
  tourStopDto,
  tourSummary,
  touchTour,
  weekMonday,
} from './model'
import './tables'
import type { TourRow } from './tables'
import { sendProtocolMail, storeProtocol } from './workflow'

/**
 * Mock endpoints of H4 Field service (API.md §7, SPEC_RESOLUTIONS #21) — same shapes,
 * permissions, validation and error codes as app/modules/h4_field.
 */

const today = () => businessToday()
const nowIso = () => new Date().toISOString()
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function srOr404(id: string | readonly string[] | undefined, request: Request) {
  const srId = intParam(id)
  const sr = srId ? db.collection('service_requests').get(srId) : undefined
  return sr ?? problems.notFound('Service request', String(id), request)
}

function tourOr404(id: string | readonly string[] | undefined, request: Request) {
  const tourId = intParam(id)
  const tour = tourId ? db.collection('tours').get(tourId) : undefined
  return tour ?? problems.notFound('Tour', String(id), request)
}

type Range = { start: string; end: string } | { error: Record<string, string[]> }

function dateRange(
  from: string | null,
  to: string | null,
  maxDays: number,
  defaultDays: number,
): Range {
  const start = from ?? weekMonday(today())
  const end = to ?? addDays(start, defaultDays - 1)
  if (end < start) return { error: { to: ["'to' must not be before 'from'."] } }
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1
  if (days > maxDays) return { error: { to: [`The range may span at most ${maxDays} days.`] } }
  return { start, end }
}

const notOwnTour = (request: Request, detail = "This stop belongs to another technician's tour.") =>
  problem(403, 'not_own_tour', 'Not your tour', { detail, request })

// ---- appointment sync (demo provider) -------------------------------------------------------------

function hash(text: string): number {
  let h = 2_166_136_261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16_777_619)
  }
  return h >>> 0
}

const SIMULATED = new Set([
  'invited',
  'reminder_1_sent',
  'reminder_2_sent',
  'escalated',
  'campus_info_sent',
  'reschedule_needed',
])

/** Demo stand-in for the booking provider sync (SPEC §8.1 `simulate_bookings`, §6.18). */
function runSync(): NonNullable<SyncState['lastResult']> {
  const counts = {
    calendars: db.collection('booking_calendars').count(),
    created: 0,
    updated: 0,
    cancelled: 0,
    matched: 0,
    unmatched: 0,
    transitions: 0,
  }
  const now = nowIso()
  const hour = now.slice(0, 13)
  for (const sr of db
    .collection('service_requests')
    .filter((s) => SIMULATED.has(s.status) && s.regionId !== null)) {
    const h = hash(`${sr.number}:${hour}`)
    if (h % 100 >= 30) continue
    const calendar = db.collection('booking_calendars').find((c) => c.regionId === sr.regionId)
    if (!calendar?.isEnabled) continue
    const startAt = businessInstant(addWorkingDays(today(), 1 + (h % 15)), 8 + ((h >> 8) % 8))
    const endAt = new Date(Date.parse(startAt) + 3_600_000).toISOString()
    db.collection('appointments').insert({
      externalId: externalIdFor(sr.number, startAt),
      calendarId: calendar.id,
      serviceRequestId: sr.id,
      reference: sr.number,
      status: 'booked',
      startAt,
      endAt,
      title: `Hardware rollout visit ${sr.number}`,
      contactName: null,
      contactEmail: null,
      street: sr.deliveryStreet,
      town: sr.deliveryCity,
      notes: null,
      bookedAt: now,
      providerUpdatedAt: now,
      source: 'sync',
      lastSyncedAt: now,
      isCurrent: true,
      supersededAt: null,
    })
    counts.created++
    counts.matched++
    setAppointment(sr.id, { startAt, endAt, calendarId: calendar.id, calendarName: calendar.name })
    const result = applyAction('serviceRequest', sr.id, 'appointment_synced', {
      actor: null,
      trigger: 'sync',
    })
    if (result.ok) counts.transitions++
  }
  db.collection('booking_sync_state').update(1, {
    lastIncrementalSyncAt: now,
    lastResult: counts,
    syncToken: String(db.collection('appointments').count()),
  })
  return counts
}

function syncRunning() {
  return db
    .collection('background_jobs')
    .all()
    .filter((job) => job.kind === 'appointments_sync')
    .map((job) => advanceJob(job.id) ?? job)
    .find((job) => job.status === 'queued' || job.status === 'running')
}

/** §6.18 step 5 for a freshly linked appointment (PRE_APPT → booked). */
function reconcileLinked(srId: number, appointmentId: number): void {
  const sr = db.collection('service_requests').get(srId)
  const row = db.collection('appointments').get(appointmentId)
  if (!sr || row?.status !== 'booked') return
  if (!PRE_APPT_STATUSES.includes(sr.status) || Date.parse(row.startAt) <= Date.now()) return
  for (const other of db
    .collection('appointments')
    .filter((a) => a.serviceRequestId === srId && a.isCurrent))
    db.collection('appointments').update(other.id, { isCurrent: false })
  db.collection('appointments').update(row.id, { isCurrent: true })
  setAppointment(srId, {
    startAt: row.startAt,
    endAt: row.endAt,
    calendarId: row.calendarId,
    calendarName: calendarRef(row.calendarId).name,
  })
  applyAction('serviceRequest', srId, 'appointment_synced', {
    actor: null,
    trigger: 'sync',
    payload: { appointmentId: row.id },
  })
}

// ---- tours ------------------------------------------------------------------------------------------

function technicianError(technicianId: unknown): Record<string, string[]> | null {
  if (technicianId === null || technicianId === undefined) return null
  const user =
    typeof technicianId === 'number' ? db.collection('users').get(technicianId) : undefined
  return user?.isActive && user.role === 'technician'
    ? null
    : { technicianId: ['Choose an active user with the technician role.'] }
}

function resolveStops(
  tour: TourRow | undefined,
  calendarId: number,
  date: string,
  ids: unknown,
  request: Request,
): Response | number[] {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'number'))
    return problems.validation(
      { serviceRequestIds: ['A list of request ids is required.'] },
      undefined,
      request,
    )
  const list = ids as number[]
  if (new Set(list).size !== list.length)
    return problems.validation(
      { serviceRequestIds: ['Each request may appear only once.'] },
      undefined,
      request,
    )
  const allowed = new Set(candidateRows(calendarId, date, tour).map((c) => c.sr.id))
  const missing = list.filter((id) => !allowed.has(id))
  if (missing.length) {
    const numbers = missing.map((id) => db.collection('service_requests').get(id)?.number ?? id)
    return problems.conflict(
      `Not a candidate for this route and day: ${numbers.join(', ')}.`,
      request,
    )
  }
  return list
}

function writeStops(tourId: number, srIds: readonly number[]): void {
  const stops = db.collection('tour_stops')
  const current = new Map(
    stopsOf(tourId)
      .filter((s) => s.outcome === 'pending')
      .map((s) => [s.serviceRequestId, s] as const),
  )
  const order: number[] = []
  for (const srId of srIds) {
    const existing = current.get(srId)
    if (existing) {
      current.delete(srId)
      order.push(existing.id)
    } else {
      const stop = stops.insert({
        tourId,
        serviceRequestId: srId,
        position: 999,
        outcome: 'pending',
        outcomeAt: null,
      })
      order.push(stop.id)
    }
  }
  for (const stop of current.values()) stops.remove(stop.id)
  setStopOrder(tourId, order)
}

function versionConflict(tour: TourRow, version: unknown, request: Request) {
  if (typeof version === 'number' && version !== tour.version)
    return problem(409, 'version_conflict', 'This record changed', {
      detail: 'Someone else updated it. Reload and try again.',
      currentVersion: tour.version,
      request,
    })
  return null
}

function notAllowed(tour: TourRow, action: string, request: Request, actions: string[]) {
  return problem(409, 'transition_not_allowed', 'Action not possible', {
    detail: `Action '${action}' is not allowed while the tour is '${tour.status}'.`,
    allowedActions: actions,
    request,
  })
}

function guardFailed(code: string, message: string, request: Request) {
  return problem(409, 'guard_failed', 'Action not possible', {
    detail: message,
    guard: { code, message },
    request,
  })
}

function overview(start: string, end: string, regionIds: number[]): TourPlannerOverview {
  const days: string[] = []
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
    if (weekday !== 0 && weekday !== 6) days.push(day)
  }
  const calendars = db
    .collection('booking_calendars')
    .filter((c) => !regionIds.length || (c.regionId !== null && regionIds.includes(c.regionId)))
    .sort((a, b) => a.name.localeCompare(b.name))
  const appointments = db
    .collection('appointments')
    .filter((a) => a.status === 'booked' && a.supersededAt === null && a.serviceRequestId !== null)
  const tours = db
    .collection('tours')
    .filter((t) => t.status !== 'cancelled' && t.tourDate >= start && t.tourDate <= end)
  const technicians = db
    .collection('users')
    .filter((u) => u.role === 'technician' && u.isActive)
    .sort((a, b) => a.lastName.localeCompare(b.lastName))
  return {
    days,
    rows: calendars.map((calendar) => ({
      calendar: calendarRef(calendar.id),
      cells: days.map((date) => {
        const tour = tours.find((t) => t.calendarId === calendar.id && t.tourDate === date)
        return {
          date,
          appointmentCount: appointments.filter(
            (a) => a.calendarId === calendar.id && onBusinessDay(a.startAt, date),
          ).length,
          plannedCount: tour ? stopsOf(tour.id).length : 0,
          tour: tour
            ? { id: tour.id, status: tour.status, technician: userRef(tour.technicianId) }
            : null,
        }
      }),
    })),
    technicians: technicians.flatMap((tech) => {
      const ref = userRef(tech.id)
      if (!ref) return []
      return [
        {
          technician: ref,
          days: days.map((date) => {
            const own = tours.filter((t) => t.technicianId === tech.id && t.tourDate === date)
            return {
              date,
              tourCount: own.length,
              stopCount: own.reduce((sum, t) => sum + stopsOf(t.id).length, 0),
            }
          }),
        },
      ]
    }),
  }
}

// ---- handlers ---------------------------------------------------------------------------------------

export const handlers: RequestHandler[] = [
  // --- calendars ---
  http.get(
    apiPath('/booking-calendars'),
    authed('appointments.read', () =>
      listOf(
        db
          .collection('booking_calendars')
          .all()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => bookingCalendar(c.id)),
      ),
    ),
  ),
  http.patch(
    apiPath('/booking-calendars/:id'),
    authed<{ id: string }>('master.manage', async ({ request, params }) => {
      const id = intParam(params.id)
      const calendar = id ? db.collection('booking_calendars').get(id) : undefined
      if (!calendar) return problems.notFound('Booking calendar', params.id, request)
      const body = await readJson<Record<string, unknown>>(request)
      const unknown = Object.keys(body).filter(
        (k) => !['name', 'regionId', 'isEnabled'].includes(k),
      )
      if (unknown.length)
        return problems.validation(
          Object.fromEntries(unknown.map((k) => [k, ['Unknown field.']])),
          undefined,
          request,
        )
      const patch: { name?: string; regionId?: number | null; isEnabled?: boolean } = {}
      if ('name' in body) {
        if (typeof body.name !== 'string' || !body.name.trim())
          return problems.validation({ name: ['A name is required.'] }, undefined, request)
        patch.name = body.name.trim()
      }
      if ('regionId' in body) {
        const regionId = body.regionId === null ? null : Number(body.regionId)
        if (regionId !== null && !db.collection('regions').get(regionId))
          return problems.validation({ regionId: ['Unknown region.'] }, undefined, request)
        patch.regionId = regionId
      }
      if ('isEnabled' in body) {
        if (typeof body.isEnabled !== 'boolean')
          return problems.validation(
            { isEnabled: ['Choose enabled or disabled.'] },
            undefined,
            request,
          )
        patch.isEnabled = body.isEnabled
      }
      db.collection('booking_calendars').update(calendar.id, patch)
      return HttpResponse.json(bookingCalendar(calendar.id))
    }),
  ),

  // --- appointments ---
  http.get(
    apiPath('/appointments/sync-state'),
    authed('appointments.read', () => {
      const state = db.collection('booking_sync_state').get(1)
      const running = syncRunning()
      const next = new Date()
      next.setUTCMinutes(5, 0, 0)
      if (next.getTime() <= Date.now()) next.setUTCHours(next.getUTCHours() + 1)
      // The demo has no scheduler: report the hourly run (hh:05) that would have happened last,
      // so the shell doesn't show "Sync overdue" just because nobody runs the job.
      const lastScheduled = new Date(next.getTime() - 3_600_000).toISOString()
      const stored = state?.lastIncrementalSyncAt ?? null
      const body: SyncState = {
        running: Boolean(running),
        lastJobId: running?.id ?? state?.lastJobId ?? null,
        lastIncrementalSyncAt: stored && stored > lastScheduled ? stored : lastScheduled,
        lastFullSyncAt: state?.lastFullSyncAt ?? null,
        lastResult: state?.lastResult ?? null,
        nextScheduledAt: next.toISOString(),
      }
      return HttpResponse.json(body)
    }),
  ),
  http.post(
    apiPath('/appointments/sync'),
    authed('appointments.manage', ({ actor, request }) => {
      const running = syncRunning()
      if (running)
        return problems.conflict(
          `An appointment sync is already running (job ${running.id}).`,
          request,
        )
      let jobId = 0
      const accepted = startJob({
        kind: 'appointments_sync',
        actor,
        durationMs: 1500,
        message: 'Syncing appointments',
        run: () => {
          const counts = runSync()
          db.collection('booking_sync_state').update(1, { lastJobId: jobId })
          return { kind: 'appointments_sync', ...counts }
        },
      })
      jobId = accepted.jobId
      return HttpResponse.json(accepted, { status: 202 })
    }),
  ),
  http.get(
    apiPath('/appointments'),
    authed('appointments.read', ({ request }) => {
      const url = new URL(request.url)
      const from = url.searchParams.get('from')
      const to = url.searchParams.get('to')
      const unmatched = url.searchParams.get('unmatched')
      const srId = intParam(url.searchParams.get('serviceRequestId') ?? undefined)
      const statuses = url.searchParams.get('status')?.split(',').filter(Boolean) ?? []
      if (statuses.some((s) => s !== 'booked' && s !== 'cancelled'))
        return problems.validation({ status: ['Unknown value.'] }, undefined, request)
      const rows = db.collection('appointments').filter((a) => {
        if (from && toBusinessDate(a.startAt) < from) return false
        if (to && toBusinessDate(a.startAt) > to) return false
        if (unmatched === 'true' && a.serviceRequestId !== null) return false
        if (unmatched === 'false' && a.serviceRequestId === null) return false
        if (srId && a.serviceRequestId !== srId) return false
        return true
      })
      return listResponse(rows, request, {
        sortable: { startAt: (a) => a.startAt, bookedAt: (a) => a.bookedAt },
        defaultSort: 'startAt',
        filters: { calendarId: filterIn((a) => a.calendarId), status: filterIn((a) => a.status) },
        search: (a, q) =>
          [a.reference, a.title, a.contactName, a.contactEmail, a.town].some((v) =>
            v?.toLowerCase().includes(q.toLowerCase()),
          ),
        map: appointmentDto,
      })
    }),
  ),
  http.post(
    apiPath('/appointments/:id/link'),
    authed<{ id: string }>('appointments.manage', async ({ request, params }) => {
      const id = intParam(params.id)
      const row = id ? db.collection('appointments').get(id) : undefined
      if (!row) return problems.notFound('Appointment', params.id, request)
      const body = await readJson<{ serviceRequestNumber: string }>(request)
      const number = normalizeCode(body.serviceRequestNumber)
      if (!number)
        return problems.validation(
          { serviceRequestNumber: ['Enter a service request number.'] },
          undefined,
          request,
        )
      if (row.serviceRequestId !== null)
        return problems.conflict(
          'This appointment is already linked to a service request.',
          request,
        )
      const sr = db.collection('service_requests').find((s) => s.number === number)
      if (!sr) return problems.notFound('Service request', number, request)
      db.collection('appointments').update(row.id, {
        serviceRequestId: sr.id,
        reference: row.reference ?? sr.number,
      })
      reconcileLinked(sr.id, row.id)
      const linked = db.collection('appointments').get(row.id)
      return linked
        ? HttpResponse.json(appointmentDto(linked))
        : problems.notFound('Appointment', row.id, request)
    }),
  ),
  http.get(
    apiPath('/service-requests/:id/appointments'),
    authed<{ id: string }>('sr.read', ({ request, params }) => {
      const sr = srOr404(params.id, request)
      if (sr instanceof Response) return sr
      const rows = db
        .collection('appointments')
        .filter((a) => a.serviceRequestId === sr.id)
        .sort((a, b) => (b.bookedAt ?? '').localeCompare(a.bookedAt ?? '') || b.id - a.id)
      return listOf(rows.map(appointmentDto))
    }),
  ),
  http.get(
    apiPath('/service-requests/:id/tour-stops'),
    authed<{ id: string }>('tours.read', ({ request, params }) => {
      const sr = srOr404(params.id, request)
      if (sr instanceof Response) return sr
      const rows = db
        .collection('tour_stops')
        .filter((s) => s.serviceRequestId === sr.id)
        .flatMap((stop) => {
          const tour = db.collection('tours').get(stop.tourId)
          return tour ? [{ stop, tour }] : []
        })
        .sort((a, b) => b.tour.tourDate.localeCompare(a.tour.tourDate) || b.stop.id - a.stop.id)
      return listOf(
        rows.map(({ stop, tour }) => ({
          tourId: tour.id,
          stopId: stop.id,
          tourDate: tour.tourDate,
          technicianName: userRef(tour.technicianId)?.displayName ?? null,
          status: tour.status,
          outcome: stop.outcome,
        })),
      )
    }),
  ),

  // --- tours ---
  http.get(
    apiPath('/tours'),
    authed('tours.read', ({ request, actor }) => {
      const url = new URL(request.url)
      const range = dateRange(url.searchParams.get('from'), url.searchParams.get('to'), 31, 7)
      if ('error' in range) return problems.validation(range.error, undefined, request)
      const technician = url.searchParams.get('technicianId')
      if (technician && technician !== 'me' && technician !== 'none' && !/^\d+$/.test(technician))
        return problems.validation(
          { technicianId: ["Use 'me', 'none' or a user id."] },
          undefined,
          request,
        )
      const regionIds =
        url.searchParams.get('regionId')?.split(',').filter(Boolean).map(Number) ?? []
      const rows = db.collection('tours').filter((t) => {
        if (t.tourDate < range.start || t.tourDate > range.end) return false
        if (technician === 'me' && t.technicianId !== actor.id) return false
        if (technician === 'none' && t.technicianId !== null) return false
        if (technician && /^\d+$/.test(technician) && t.technicianId !== Number(technician))
          return false
        if (regionIds.length) {
          const region = calendarRef(t.calendarId).region
          if (!region || !regionIds.includes(region.id)) return false
        }
        return true
      })
      return listResponse(rows, request, {
        sortable: { tourDate: (t) => t.tourDate, calendar: (t) => calendarRef(t.calendarId).name },
        defaultSort: 'tourDate',
        filters: { calendarId: filterIn((t) => t.calendarId), status: filterIn((t) => t.status) },
        map: (t) => tourSummary(t, actor, today()),
      })
    }),
  ),
  http.post(
    apiPath('/tours'),
    authed('tours.plan', async ({ request, actor }) => {
      const body = await readJson<Record<string, unknown>>(request)
      const calendarId = typeof body.calendarId === 'number' ? body.calendarId : Number.NaN
      const tourDate = typeof body.tourDate === 'string' ? body.tourDate : ''
      const errors: Record<string, string[]> = {}
      if (!db.collection('booking_calendars').get(calendarId))
        errors.calendarId = ['Unknown booking calendar.']
      if (!ISO_DAY.test(tourDate)) errors.tourDate = ['Choose a date.']
      Object.assign(errors, technicianError(body.technicianId))
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      const existing = activeTour(calendarId, tourDate)
      if (existing)
        return problem(409, 'tour_exists', 'Tour exists', {
          detail: `A tour for ${calendarRef(calendarId).name} on ${tourDate} already exists (tour ${existing.id}).`,
          request,
        })
      const ids = resolveStops(
        undefined,
        calendarId,
        tourDate,
        body.serviceRequestIds ?? [],
        request,
      )
      if (ids instanceof Response) return ids
      const technicianId = typeof body.technicianId === 'number' ? body.technicianId : null
      const tour = db.collection('tours').insert({
        calendarId,
        tourDate,
        technicianId,
        status: technicianId ? 'planned' : 'draft',
        notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
        startedAt: null,
        finishedAt: null,
        createdBy: actor.id,
        version: 1,
      })
      writeStops(tour.id, ids)
      return HttpResponse.json(tourDetail(tour, actor, today()), { status: 201 })
    }),
  ),
  http.get(
    apiPath('/tours/:id'),
    authed<{ id: string }>('tours.read', ({ request, params, actor }) => {
      const tour = tourOr404(params.id, request)
      if (tour instanceof Response) return tour
      return HttpResponse.json(tourDetail(tour, actor, today()))
    }),
  ),
  http.patch(
    apiPath('/tours/:id'),
    authed<{ id: string }>('tours.plan', async ({ request, params, actor }) => {
      const tour = tourOr404(params.id, request)
      if (tour instanceof Response) return tour
      const body = await readJson<Record<string, unknown>>(request)
      const conflict = versionConflict(tour, body.version, request)
      if (conflict) return conflict
      const patch: Partial<TourRow> = {}
      if ('technicianId' in body && body.technicianId !== tour.technicianId) {
        const actions = tourSummary(tour, actor, today()).availableActions
        if (body.technicianId === null) {
          if (tour.status !== 'planned')
            return notAllowed(tour, 'unassign_technician', request, actions)
          patch.technicianId = null
          patch.status = 'draft'
        } else {
          if (tour.status !== 'draft' && tour.status !== 'planned')
            return notAllowed(tour, 'assign_technician', request, actions)
          const error = technicianError(body.technicianId)
          if (error) return problems.validation(error, undefined, request)
          patch.technicianId = Number(body.technicianId)
          patch.status = 'planned'
        }
      }
      if ('notes' in body)
        patch.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
      const updated = Object.keys(patch).length ? touchTour(tour.id, patch) : tour
      return HttpResponse.json(tourDetail(updated ?? tour, actor, today()))
    }),
  ),
  http.put(
    apiPath('/tours/:id/stops'),
    authed<{ id: string }>('tours.plan', async ({ request, params, actor }) => {
      const tour = tourOr404(params.id, request)
      if (tour instanceof Response) return tour
      if (!['draft', 'planned', 'in_progress'].includes(tour.status))
        return problems.conflict(`Stops of a ${tour.status} tour cannot be changed.`, request)
      const body = await readJson<Record<string, unknown>>(request)
      const conflict = versionConflict(tour, body.version, request)
      if (conflict) return conflict
      const ids = resolveStops(
        tour,
        tour.calendarId,
        tour.tourDate,
        body.serviceRequestIds,
        request,
      )
      if (ids instanceof Response) return ids
      writeStops(tour.id, ids)
      return HttpResponse.json(tourDetail(tour, actor, today()))
    }),
  ),
  http.post(
    apiPath('/tours/:id/actions/:action'),
    authed<{ id: string; action: string }>('tours.read', async ({ request, params, actor }) => {
      const tour = tourOr404(params.id, request)
      if (tour instanceof Response) return tour
      const body = await readJson<Record<string, unknown>>(request)
      const conflict = versionConflict(tour, body.version, request)
      if (conflict) return conflict
      const actions = tourSummary(tour, actor, today()).availableActions
      const now = nowIso()
      if (params.action === 'start' || params.action === 'finish') {
        if (!canExecute(actor)) return problems.forbidden(undefined, request)
        if (!canExecuteTour(actor, tour))
          return notOwnTour(request, 'This tour belongs to another technician.')
        if (params.action === 'start') {
          if (tour.status !== 'planned') return notAllowed(tour, 'start', request, actions)
          if (tour.tourDate !== today())
            return guardFailed(
              'tour_date_today',
              'A tour can only be started on its tour date.',
              request,
            )
          touchTour(tour.id, { status: 'in_progress', startedAt: now })
        } else {
          if (tour.status !== 'in_progress') return notAllowed(tour, 'finish', request, actions)
          if (stopsOf(tour.id).some((s) => s.outcome === 'pending'))
            return guardFailed('no_pending_stops', 'Every stop needs an outcome first.', request)
          touchTour(tour.id, { status: 'completed', finishedAt: now })
        }
      } else if (params.action === 'cancel') {
        if (!actor.permissions.includes('tours.plan')) return problems.forbidden(undefined, request)
        if (tour.status !== 'draft' && tour.status !== 'planned')
          return notAllowed(tour, 'cancel', request, actions)
        db.collection('tour_stops').removeWhere(
          (s) => s.tourId === tour.id && s.outcome === 'pending',
        )
        touchTour(tour.id, { status: 'cancelled' })
      } else {
        return problem(404, 'unknown_action', 'Unknown action', {
          detail: `"${params.action}" is not a tour action.`,
          request,
        })
      }
      const fresh = db.collection('tours').get(tour.id) ?? tour
      return HttpResponse.json(tourDetail(fresh, actor, today()))
    }),
  ),
  http.get(
    apiPath('/tour-planner/candidates'),
    authed('tours.read', ({ request, actor }) => {
      const url = new URL(request.url)
      const calendarId = Number(url.searchParams.get('calendarId'))
      const date = url.searchParams.get('date') ?? ''
      if (!db.collection('booking_calendars').get(calendarId))
        return problems.validation(
          { calendarId: ['Unknown booking calendar.'] },
          undefined,
          request,
        )
      if (!ISO_DAY.test(date))
        return problems.validation({ date: ['Choose a date.'] }, undefined, request)
      const tour = activeTour(calendarId, date)
      return HttpResponse.json({
        calendar: calendarRef(calendarId),
        date,
        tour: tour ? tourSummary(tour, actor, today()) : null,
        candidates: candidateRows(calendarId, date, tour).map(({ sr, inTourId }) => ({
          serviceRequest: srListItem(sr, actor),
          readiness: readinessOf(sr.status),
          inTourId,
        })),
      })
    }),
  ),
  http.get(
    apiPath('/tour-planner/overview'),
    authed('tours.read', ({ request }) => {
      const url = new URL(request.url)
      const range = dateRange(url.searchParams.get('from'), url.searchParams.get('to'), 14, 5)
      if ('error' in range) return problems.validation(range.error, undefined, request)
      const regionIds =
        url.searchParams.get('regionId')?.split(',').filter(Boolean).map(Number) ?? []
      return HttpResponse.json(overview(range.start, range.end, regionIds))
    }),
  ),
  http.get(
    apiPath('/my/tours'),
    authed('tours.execute_own', ({ request, actor }) => {
      const date = new URL(request.url).searchParams.get('date') ?? today()
      const tours = db
        .collection('tours')
        .filter(
          (t) => t.technicianId === actor.id && t.tourDate === date && t.status !== 'cancelled',
        )
        .sort((a, b) => a.calendarId - b.calendarId)
      return listOf(tours.map((t) => tourDetail(t, actor, today())))
    }),
  ),

  // --- deployment ---
  http.get(
    apiPath('/tours/:tourId/stops/:stopId/deployment'),
    authed<{ tourId: string; stopId: string }>(null, ({ request, params, actor }) => {
      if (!canExecute(actor)) return problems.forbidden(undefined, request)
      const tour = tourOr404(params.tourId, request)
      if (tour instanceof Response) return tour
      const stop = stopsOf(tour.id).find((s) => s.id === intParam(params.stopId))
      if (!stop) return problems.notFound('Stop', params.stopId, request)
      if (!canExecuteTour(actor, tour)) return notOwnTour(request)
      const sr = db.collection('service_requests').get(stop.serviceRequestId)
      const contact = sr ? db.collection('contacts').get(sr.contactId) : undefined
      if (!sr || !contact)
        return problems.notFound('Service request', stop.serviceRequestId, request)
      const detail = srDetail(sr, actor)
      const deliver = detail.items.filter((i) => i.direction === 'deliver' && i.asset !== null)
      const collect = detail.items.filter((i) => i.direction === 'collect')
      const deviationCodes = db
        .collection('deviation_codes')
        .filter((c) => c.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => deviationCode(c.id))
        .filter((c): c is DeviationCode => c !== null)
      const view: DeploymentView = {
        tour: tourSummary(tour, actor, today()),
        stop: tourStopDto(stop),
        serviceRequest: detail,
        contact: contactDetail(contact),
        workInstructions: {
          procurementType: sr.procurementType,
          scopeOfDelivery: sr.scopeOfDelivery,
          clientComponent: sr.clientComponent,
          osReinstall: sr.osReinstall,
          withoutAssetPrep: sr.withoutAssetPrep,
          software: [...new Set([...sr.requestedSoftware, ...sr.addedSoftware])],
          note: sr.note,
          onsiteContactPhone: sr.onsiteContactPhone,
          deliveryAddress: {
            street: sr.deliveryStreet,
            zip: sr.deliveryZip,
            city: sr.deliveryCity,
            country: sr.deliveryCountry,
            room: sr.deliveryRoom,
            building: sr.deliveryBuilding,
          },
          isCampus: sr.isCampus,
        },
        deviationCodes,
        progress: {
          newVerified: deliver.filter((i) => i.verifiedAt).length,
          newTotal: deliver.length,
          oldVerified: collect.filter((i) => i.verifiedAt).length,
          oldTotal: collect.length,
        },
      }
      return HttpResponse.json(view)
    }),
  ),
  http.post(
    apiPath('/scan/deployment'),
    authed(null, async ({ request, actor }) => {
      if (!canExecute(actor)) return problems.forbidden(undefined, request)
      const body = await readJson<{ serviceRequestId: number; serial: string }>(request)
      const errors: Record<string, string[]> = {}
      if (typeof body.serviceRequestId !== 'number') errors.serviceRequestId = ['Required.']
      if (!normalizeCode(body.serial)) errors.serial = ['Scan a serial number or asset tag.']
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      const sr = db.collection('service_requests').get(Number(body.serviceRequestId))
      if (!sr) return problems.notFound('Service request', body.serviceRequestId, request)
      const blocked = activeContext(sr, actor, request, today(), nowIso())
      if (blocked) return blocked
      return HttpResponse.json(scanDeployment(sr, normalizeCode(body.serial), actor, nowIso()))
    }),
  ),
  http.delete(
    apiPath('/service-requests/:id/items/:slot/verification'),
    authed<{ id: string; slot: string }>(null, ({ request, params, actor }) => {
      const sr = srOr404(params.id, request)
      if (sr instanceof Response) return sr
      const blocked = activeContext(sr, actor, request, today(), nowIso())
      if (blocked) return blocked
      const result = undoVerification(sr, String(params.slot), request)
      return result instanceof Response ? result : HttpResponse.json(srItem(result))
    }),
  ),
  http.post(
    apiPath('/service-requests/:id/items/:slot/register-unknown'),
    authed<{ id: string; slot: string }>(null, async ({ request, params, actor }) => {
      const sr = srOr404(params.id, request)
      if (sr instanceof Response) return sr
      const blocked = activeContext(sr, actor, request, today(), nowIso())
      if (blocked) return blocked
      const body = await readJson<Record<string, unknown>>(request)
      const result = registerUnknown(sr, String(params.slot), body, actor, request, nowIso())
      return result instanceof Response
        ? result
        : HttpResponse.json(srItem(result), { status: 201 })
    }),
  ),
  http.get(
    apiPath('/service-requests/:id/protocol'),
    authed<{ id: string }>('sr.read', ({ request, params, actor }) => {
      const sr = srOr404(params.id, request)
      if (sr instanceof Response) return sr
      if (sr.status !== 'completed') return problems.notFound('Protocol', sr.number, request)
      // backend-exported file rows carry no bytes: regenerate the demo protocol then
      const existing = sr.protocolFileId
        ? db.collection('stored_files').get(sr.protocolFileId)
        : undefined
      if (!existing?.contentBase64) storeProtocol(sr.id, actor.id)
      const fileId = db.collection('service_requests').get(sr.id)?.protocolFileId
      const file = fileId ? db.collection('stored_files').get(fileId) : undefined
      return file
        ? HttpResponse.json(downloadLink(file))
        : problems.notFound('Protocol', sr.number, request)
    }),
  ),
  http.post(
    apiPath('/service-requests/:id/protocol/send'),
    authed<{ id: string }>(null, async ({ request, params, actor }) => {
      const sr = srOr404(params.id, request)
      if (sr instanceof Response) return sr
      if (!canExecute(actor)) return problems.forbidden(undefined, request)
      if (sr.status !== 'completed') return problems.notFound('Protocol', sr.number, request)
      const stop = db
        .collection('tour_stops')
        .filter((s) => s.serviceRequestId === sr.id)
        .at(-1)
      const tour = tourOfStop(stop)
      const allowed = tour
        ? canExecuteTour(actor, tour)
        : actor.permissions.includes('tours.execute_any')
      if (!allowed) return notOwnTour(request, 'This request was not on one of your tours.')
      const body = await readJson<{ email: string | null }>(request)
      const contact = db.collection('contacts').get(sr.contactId)
      const email = (typeof body.email === 'string' && body.email.trim()) || contact?.email
      if (!email)
        return problems.validation(
          { email: ['The contact has no email address. Enter one.'] },
          undefined,
          request,
        )
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        return problems.validation({ email: ['Enter a valid email address.'] }, undefined, request)
      if (!sr.protocolFileId) storeProtocol(sr.id, actor.id)
      sendProtocolMail(sr.id, email, actor.id)
      return HttpResponse.json({ notificationId: crypto.randomUUID() }, { status: 202 })
    }),
  ),
]
