import type {
  Appointment,
  BookingCalendar,
  Readiness,
  ServiceRequestStatus,
  TourDetail,
  TourStop,
  TourStopOutcome,
  TourSummary,
} from '@/lib/api/types'
import { getBusinessTimeZone, toBusinessDate } from '@/lib/format'
import type { MockActor } from '@/mocks/auth'
import type { ServiceRequestItemRow, ServiceRequestRow } from '@/mocks/core/tables'
import { articleRef, contactRef, itemsOf, regionRef, userRef } from '@/mocks/core/read-models'
import { db } from '@/mocks/db'
import './tables'
import type { AppointmentRow, TourRow, TourStopRow } from './tables'

/**
 * Mock twin of the H4 backend services (app/modules/h4_field): calendars, current
 * appointments, tours and stops, readiness and the tour read models (API.md §7).
 */

// ---- constants ---------------------------------------------------------------------------------

/** Region code → default technician (SPEC §11.6). */
export const TECHNICIAN_BY_REGION: Record<string, string> = {
  riverton: 'theo.technician@example.com',
  hillford: 'tara.lindqvist@example.com',
  eastgate: 'omar.reyes@example.com',
  northport: 'omar.reyes@example.com',
  southmere: 'omar.reyes@example.com',
  westbay: 'jonas.weber@example.com',
  lakeside: 'jonas.weber@example.com',
  highmoor: 'jonas.weber@example.com',
  oakridge: 'jonas.weber@example.com',
}

export const WITH_APPT_STATUSES: readonly ServiceRequestStatus[] = [
  'appointment_booked',
  'personalization_in_progress',
  'personalization_done',
  'ready_for_picking',
  'provided',
  'shipped',
]
export const PRE_APPT_STATUSES: readonly ServiceRequestStatus[] = [
  'imported',
  'imported_vip',
  'invited',
  'campus_info_sent',
  'reminder_1_sent',
  'reminder_2_sent',
  'escalated',
  'reschedule_needed',
]
export const ON_SITE: readonly ServiceRequestStatus[] = ['provided', 'shipped']

// ---- time ----------------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

/** UTC ISO timestamp of a business-local wall-clock time (business TZ from /meta/config). */
export function businessInstant(date: string, hour: number, minute = 0): string {
  const guess = Date.parse(`${date}T${pad(hour)}:${pad(minute)}:00Z`)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: getBusinessTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(guess))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return new Date(guess - (local - guess)).toISOString()
}

/** `[start, end)` of a business day as ISO strings. */
export function dayBounds(date: string): [string, string] {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return [businessInstant(date, 0), businessInstant(next.toISOString().slice(0, 10), 0)]
}

export function onBusinessDay(iso: string | null | undefined, date: string): boolean {
  return typeof iso === 'string' && toBusinessDate(iso) === date
}

/** Monday of the week of a business date. */
export function weekMonday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - (day - 1))
  return d.toISOString().slice(0, 10)
}

/** D0: today if Mon–Fri, else next Monday (SPEC_RESOLUTIONS #47). */
export function anchorDay(today: string): string {
  const d = new Date(`${today}T00:00:00Z`)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// ---- calendars ----------------------------------------------------------------------------------

export function calendarDefs(): { id: number; regionId: number; code: string; name: string }[] {
  return db
    .collection('regions')
    .all()
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((region, index) => ({
      id: index + 1,
      regionId: region.id,
      code: region.code,
      name: `${region.code.charAt(0).toUpperCase()}${region.code.slice(1)} route`,
    }))
}

export function calendarIdForRegion(regionId: number | null): number | null {
  if (!regionId) return null
  const calendar = db.collection('booking_calendars').find((c) => c.regionId === regionId)
  return calendar?.id ?? null
}

export function regionCodeOfCalendar(calendarId: number): string | null {
  const calendar = db.collection('booking_calendars').get(calendarId)
  const region = calendar?.regionId ? db.collection('regions').get(calendar.regionId) : undefined
  return region?.code ?? null
}

export function calendarRef(calendarId: number) {
  const calendar = db.collection('booking_calendars').get(calendarId)
  return {
    id: calendarId,
    name: calendar?.name ?? `Calendar ${calendarId}`,
    region: regionRef(calendar?.regionId ?? null),
  }
}

export function upcomingCount(calendarId: number, now = Date.now()): number {
  return db
    .collection('appointments')
    .count(
      (a) =>
        a.calendarId === calendarId &&
        a.status === 'booked' &&
        a.supersededAt === null &&
        Date.parse(a.startAt) >= now,
    )
}

export function bookingCalendar(calendarId: number): BookingCalendar | null {
  const row = db.collection('booking_calendars').get(calendarId)
  if (!row) return null
  return {
    id: row.id,
    externalId: row.externalId,
    name: row.name,
    region: regionRef(row.regionId),
    serviceIds: row.serviceIds,
    calendarType: row.calendarType,
    isEnabled: row.isEnabled,
    syncedAt: row.syncedAt,
    upcomingAppointments: upcomingCount(row.id),
  }
}

// ---- appointments ------------------------------------------------------------------------------

export function appointmentDto(row: AppointmentRow): Appointment {
  const sr = row.serviceRequestId
    ? db.collection('service_requests').get(row.serviceRequestId)
    : undefined
  return {
    id: row.id,
    externalId: row.externalId,
    calendar: { id: row.calendarId, name: calendarRef(row.calendarId).name },
    serviceRequest: sr ? { id: sr.id, number: sr.number, status: sr.status } : null,
    reference: row.reference,
    status: row.status,
    startAt: row.startAt,
    endAt: row.endAt,
    title: row.title,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    street: row.street,
    town: row.town,
    notes: row.notes,
    bookedAt: row.bookedAt,
    source: row.source,
    isCurrent: row.isCurrent,
  }
}

export function currentAppointment(srId: number): AppointmentRow | undefined {
  return db.collection('appointments').find((a) => a.serviceRequestId === srId && a.isCurrent)
}

/** SPEC_RESOLUTIONS #7: bookings that exist at a reschedule never become current again. */
export function supersedeAll(srId: number, now: string): void {
  const appointments = db.collection('appointments')
  for (const row of appointments.filter(
    (a) => a.serviceRequestId === srId && a.status === 'booked' && a.supersededAt === null,
  )) {
    appointments.update(row.id, { isCurrent: false, supersededAt: now })
  }
}

export function externalIdFor(reference: string, startAt: string): string {
  let hash = 2_166_136_261
  const text = `${reference}${startAt}`
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16_777_619)
  }
  return `appt-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

// ---- readiness, items ----------------------------------------------------------------------------

export function readinessOf(status: ServiceRequestStatus): Readiness {
  if (status === 'provided' || status === 'shipped' || status === 'completed') return 'ready'
  if (status === 'ready_for_picking') return 'to_pick'
  if (status === 'personalization_in_progress' || status === 'personalization_done')
    return 'in_staging'
  return 'not_started'
}

export const isNewSlot = (slot: string) => slot.startsWith('new_')

export function itemLabel(item: ServiceRequestItemRow): string {
  if (isNewSlot(item.slot))
    return articleRef(item.articleId)?.name ?? item.requestedType ?? 'Device'
  const asset = item.assetId ? db.collection('assets').get(item.assetId) : undefined
  return asset?.assetTag ?? item.expectedAssetTag ?? asset?.serialNumber ?? 'Device'
}

/** Items a deployment verifies: new items with an asset, every old item (SPEC §6.11). */
export function countedItems(srId: number): ServiceRequestItemRow[] {
  const items = itemsOf(srId)
  return [
    ...items.filter((i) => isNewSlot(i.slot) && i.assetId !== null),
    ...items.filter((i) => !isNewSlot(i.slot)),
  ]
}

// ---- tours ---------------------------------------------------------------------------------------

export function stopsOf(tourId: number): TourStopRow[] {
  return db
    .collection('tour_stops')
    .filter((s) => s.tourId === tourId)
    .sort((a, b) => a.position - b.position)
}

export function pendingStopOf(srId: number): TourStopRow | undefined {
  return db
    .collection('tour_stops')
    .find((s) => s.serviceRequestId === srId && s.outcome === 'pending')
}

export function tourOfStop(stop: TourStopRow | undefined): TourRow | undefined {
  return stop ? db.collection('tours').get(stop.tourId) : undefined
}

export function canExecuteTour(actor: MockActor | null, tour: TourRow | undefined): boolean {
  if (!actor) return false
  if (actor.permissions.includes('tours.execute_any')) return true
  return tour?.technicianId === actor.id && actor.permissions.includes('tours.execute_own')
}

export function tourAvailableActions(
  tour: TourRow,
  actor: MockActor | null,
  today: string,
): string[] {
  if (!actor) return []
  const pending = stopsOf(tour.id).some((s) => s.outcome === 'pending')
  const actions: string[] = []
  if (
    tour.status === 'planned' &&
    tour.tourDate === today &&
    tour.technicianId !== null &&
    canExecuteTour(actor, tour)
  )
    actions.push('start')
  if (tour.status === 'in_progress' && !pending && canExecuteTour(actor, tour))
    actions.push('finish')
  if (actor.permissions.includes('tours.plan')) {
    if (tour.status === 'draft' || tour.status === 'planned')
      actions.push('cancel', 'assign_technician')
    if (tour.status === 'planned') actions.push('unassign_technician')
  }
  return actions
}

function srOf(id: number): ServiceRequestRow {
  const sr = db.collection('service_requests').get(id)
  if (!sr) throw new Error(`service request ${id} missing`)
  return sr
}

export function tourStopDto(stop: TourStopRow): TourStop {
  const sr = srOf(stop.serviceRequestId)
  const contact = db.collection('contacts').get(sr.contactId)
  const items = itemsOf(sr.id)
  return {
    id: stop.id,
    position: stop.position,
    outcome: stop.outcome,
    outcomeAt: stop.outcomeAt,
    readiness: readinessOf(sr.status),
    serviceRequest: {
      id: sr.id,
      number: sr.number,
      status: sr.status,
      deliveryType: sr.deliveryTypeOverride ?? sr.deliveryType,
      isCampus: sr.isCampus,
      isVip: sr.isVip,
      contact: {
        ...(contact
          ? contactRef(contact)
          : { id: sr.contactId, userId: '?', displayName: 'Unknown', email: null }),
        phone: contact?.phone ?? null,
        mobile: contact?.mobile ?? null,
      },
      onsiteContactPhone: sr.onsiteContactPhone,
      deliveryAddress: {
        street: sr.deliveryStreet,
        zip: sr.deliveryZip,
        city: sr.deliveryCity,
        country: sr.deliveryCountry,
        room: sr.deliveryRoom,
        building: sr.deliveryBuilding,
      },
      appointmentStartAt: sr.appointmentStartAt,
      appointmentEndAt: sr.appointmentEndAt,
      newItems: items
        .filter((i) => isNewSlot(i.slot))
        .map((i) => ({ slot: i.slot, label: itemLabel(i), verified: i.verifiedAt !== null })),
      oldItems: items
        .filter((i) => !isNewSlot(i.slot))
        .map((i) => ({ slot: i.slot, label: itemLabel(i), verified: i.verifiedAt !== null })),
    },
  }
}

export function tourSummary(tour: TourRow, actor: MockActor | null, today: string): TourSummary {
  const stops = stopsOf(tour.id)
  const count = (outcome: TourStopOutcome) => stops.filter((s) => s.outcome === outcome).length
  const readiness: Record<Readiness, number> = {
    ready: 0,
    to_pick: 0,
    in_staging: 0,
    not_started: 0,
  }
  for (const stop of stops) {
    if (stop.outcome === 'pending') readiness[readinessOf(srOf(stop.serviceRequestId).status)]++
  }
  const starts = stops
    .map((s) => srOf(s.serviceRequestId).appointmentStartAt)
    .filter((v): v is string => Boolean(v))
    .sort()
  return {
    id: tour.id,
    calendar: calendarRef(tour.calendarId),
    tourDate: tour.tourDate,
    technician: userRef(tour.technicianId),
    status: tour.status,
    stopCount: stops.length,
    pendingCount: count('pending'),
    completedCount: count('completed'),
    rescheduledCount: count('rescheduled'),
    cancelledCount: count('cancelled'),
    firstAppointmentAt: starts[0] ?? null,
    lastAppointmentAt: starts.at(-1) ?? null,
    readiness,
    availableActions: tourAvailableActions(tour, actor, today),
  }
}

export function tourWarnings(tour: TourRow): string[] {
  const warnings: string[] = []
  if (
    tour.technicianId !== null &&
    tour.status !== 'cancelled' &&
    db
      .collection('tours')
      .count(
        (t) =>
          t.id !== tour.id &&
          t.technicianId === tour.technicianId &&
          t.tourDate === tour.tourDate &&
          t.status !== 'cancelled',
      ) > 0
  )
    warnings.push('technician_has_other_tour')
  const pending = stopsOf(tour.id).filter((s) => s.outcome === 'pending')
  if (pending.some((s) => readinessOf(srOf(s.serviceRequestId).status) !== 'ready'))
    warnings.push('stops_not_ready')
  if (
    pending.some((s) => {
      const sr = srOf(s.serviceRequestId)
      return (
        !onBusinessDay(sr.appointmentStartAt, tour.tourDate) ||
        sr.appointmentCalendarId !== tour.calendarId
      )
    })
  )
    warnings.push('appointment_outside_tour_date')
  return warnings
}

export function tourDetail(tour: TourRow, actor: MockActor | null, today: string): TourDetail {
  return {
    ...tourSummary(tour, actor, today),
    notes: tour.notes,
    startedAt: tour.startedAt,
    finishedAt: tour.finishedAt,
    stops: stopsOf(tour.id).map(tourStopDto),
    warnings: tourWarnings(tour),
    version: tour.version,
  }
}

// ---- tour state ------------------------------------------------------------------------------------

export function touchTour(tourId: number, patch: Partial<TourRow>): TourRow | undefined {
  return db.collection('tours').update(tourId, (current) => ({
    ...current,
    ...patch,
    version: current.version + 1,
  }))
}

function renumber(tourId: number, pendingOrder?: readonly number[]): void {
  const stops = db.collection('tour_stops')
  const all = stopsOf(tourId)
  const done = all.filter((s) => s.outcome !== 'pending')
  const pending = pendingOrder
    ? pendingOrder
        .map((id) => all.find((s) => s.id === id))
        .filter((s): s is TourStopRow => s !== undefined)
    : all.filter((s) => s.outcome === 'pending')
  ;[...done, ...pending].forEach((stop, index) => {
    if (stop.position !== index + 1) stops.update(stop.id, { position: index + 1 })
  })
}

export function setStopOrder(tourId: number, pendingIds: readonly number[]): void {
  renumber(tourId, pendingIds)
}

/** Auto-complete when no pending stop remains (SPEC §4.7, SPEC_RESOLUTIONS #32). */
export function maybeCompleteTour(tourId: number, now: string): void {
  const tour = db.collection('tours').get(tourId)
  if (!tour || !['draft', 'planned', 'in_progress'].includes(tour.status)) return
  const stops = stopsOf(tourId)
  if (stops.length === 0 || stops.some((s) => s.outcome === 'pending')) return
  touchTour(tourId, { status: 'completed', finishedAt: now })
}

export function setStopOutcome(stopId: number, outcome: TourStopOutcome, now: string): void {
  const stop = db.collection('tour_stops').update(stopId, { outcome, outcomeAt: now })
  if (stop) maybeCompleteTour(stop.tourId, now)
}

export function removeStop(stopId: number): void {
  const stop = db.collection('tour_stops').get(stopId)
  if (!stop) return
  db.collection('tour_stops').remove(stopId)
  renumber(stop.tourId)
}

/** SPEC_RESOLUTIONS #8: in-progress tours keep the stop with an outcome, others drop it. */
export function releasePendingStop(srId: number, outcome: TourStopOutcome, now: string): void {
  const stop = pendingStopOf(srId)
  if (!stop) return
  const tour = tourOfStop(stop)
  if (tour?.status === 'in_progress') setStopOutcome(stop.id, outcome, now)
  else removeStop(stop.id)
}

/** The first stop action on a planned tour of today starts it (SPEC_RESOLUTIONS #32). */
export function ensureTourRunning(srId: number, now: string): void {
  const tour = tourOfStop(pendingStopOf(srId))
  if (tour?.status === 'planned') touchTour(tour.id, { status: 'in_progress', startedAt: now })
}

/** Guard `tour_startable`: null when the stop's tour is on the road or startable today. */
export function tourStartableFailure(
  srId: number,
  today: string,
): { code: string; message: string } | null {
  const tour = tourOfStop(pendingStopOf(srId))
  if (!tour || tour.status === 'in_progress') return null
  if (tour.status === 'planned' && tour.tourDate === today && tour.technicianId !== null)
    return null
  return {
    code: 'tour_startable',
    message: `The tour of this stop is not on the road (tour date ${tour.tourDate}, status ${tour.status}).`,
  }
}

/** Candidate SRs of a route and day (SPEC §6.12) with the tour holding them. */
export function candidateRows(
  calendarId: number,
  date: string,
  tour: TourRow | undefined,
): { sr: ServiceRequestRow; inTourId: number | null }[] {
  const pending = new Map(
    db
      .collection('tour_stops')
      .filter((s) => s.outcome === 'pending')
      .map((s) => [s.serviceRequestId, s.tourId] as const),
  )
  const rows = db
    .collection('service_requests')
    .filter(
      (sr) =>
        sr.appointmentCalendarId === calendarId &&
        onBusinessDay(sr.appointmentStartAt, date) &&
        WITH_APPT_STATUSES.includes(sr.status),
    )
    .sort(
      (a, b) =>
        (a.appointmentStartAt ?? '').localeCompare(b.appointmentStartAt ?? '') || a.id - b.id,
    )
  const result: { sr: ServiceRequestRow; inTourId: number | null }[] = []
  for (const sr of rows) {
    const inTour = pending.get(sr.id) ?? null
    if (inTour !== null && inTour !== tour?.id) continue
    result.push({ sr, inTourId: inTour })
  }
  if (tour) {
    for (const stop of stopsOf(tour.id)) {
      if (stop.outcome === 'pending' && !result.some((r) => r.sr.id === stop.serviceRequestId)) {
        result.push({ sr: srOf(stop.serviceRequestId), inTourId: tour.id })
      }
    }
  }
  return result
}

export function activeTour(calendarId: number, date: string): TourRow | undefined {
  return db
    .collection('tours')
    .find((t) => t.calendarId === calendarId && t.tourDate === date && t.status !== 'cancelled')
}
