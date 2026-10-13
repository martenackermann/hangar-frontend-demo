import { addDays, addWorkingDays, isWorkingDay, toBusinessDate } from '@/lib/format'
import type { StatusTransitionRow } from '@/mocks/core/tables'
import type { DemoDatabase, SeedDefinition } from '@/mocks/db'
import {
  anchorDay,
  businessInstant,
  calendarDefs,
  calendarIdForRegion,
  externalIdFor,
  TECHNICIAN_BY_REGION,
  weekMonday,
  WITH_APPT_STATUSES,
} from './model'
import './tables'
import type { AppointmentRow, TourRow, TourStopRow } from './tables'

/**
 * H4 demo data (SPEC §11.6). When the backend export carries the H4 tables
 * (`booking_calendars`, `appointments`, `booking_sync_state`, `tours`, `tour_stops`) they are
 * loaded as they are; otherwise this seed derives the same story from the core rows:
 * calendars 1–9, one current appointment per SR with `appointment_*`, the reschedule history,
 * 5 unmatched appointments next week, tours from Monday of D0's week to Friday of the next
 * week (Theo: today's Riverton tour with his 5 `provided` stops) and the sync state.
 */

const UNMATCHED_REFERENCES = ['SR001230', null, 'SR00I2047', 'SR 0012188', 'Hardware swap']

function transitionsBySr(db: DemoDatabase): Map<number, StatusTransitionRow[]> {
  const map = new Map<number, StatusTransitionRow[]>()
  for (const row of db.collection('status_transitions').all()) {
    if (row.entityType !== 'service_request') continue
    const list = map.get(row.entityId) ?? []
    list.push(row)
    map.set(row.entityId, list)
  }
  for (const list of map.values()) list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  return map
}

function latest(
  list: readonly StatusTransitionRow[] | undefined,
  actions: readonly string[],
): StatusTransitionRow | undefined {
  return list?.filter((t) => actions.includes(t.action)).at(-1)
}

function ensureCalendars(db: DemoDatabase, now: string): void {
  const calendars = db.collection('booking_calendars')
  if (calendars.count() > 0) return
  for (const def of calendarDefs()) {
    calendars.insert({
      id: def.id,
      externalId: `cal-${def.code}`,
      name: def.name,
      regionId: def.regionId,
      serviceIds: ['svc-hw-rollout'],
      calendarType: 'route',
      isEnabled: true,
      syncedAt: now,
    })
  }
}

function seedAppointments(
  db: DemoDatabase,
  today: string,
  history: Map<number, StatusTransitionRow[]>,
  synced: string,
  pick: () => number,
  name: () => string,
): void {
  const appointments = db.collection('appointments')
  const rows: Omit<AppointmentRow, 'id'>[] = []
  const srs = db.collection('service_requests').all()
  for (const sr of srs) {
    if (!sr.appointmentStartAt || !sr.appointmentCalendarId) continue
    const contact = db.collection('contacts').get(sr.contactId)
    const event = latest(history.get(sr.id), ['appointment_synced', 'book_appointment'])
    const bookedAt =
      event?.occurredAt ??
      new Date(Date.parse(sr.appointmentStartAt) - 7 * 86_400_000).toISOString()
    rows.push({
      externalId: externalIdFor(sr.number, sr.appointmentStartAt),
      calendarId: sr.appointmentCalendarId,
      serviceRequestId: sr.id,
      reference: sr.number,
      status: 'booked',
      startAt: sr.appointmentStartAt,
      endAt:
        sr.appointmentEndAt ??
        new Date(Date.parse(sr.appointmentStartAt) + 3_600_000).toISOString(),
      title: `Hardware rollout visit ${sr.number}`,
      contactName: contact ? `${contact.firstName ?? ''} ${contact.lastName}`.trim() : null,
      contactEmail: contact?.email ?? null,
      street: sr.deliveryStreet,
      town: sr.deliveryCity,
      notes: null,
      bookedAt,
      providerUpdatedAt: bookedAt,
      source: event?.action === 'book_appointment' ? 'manual' : 'sync',
      lastSyncedAt: synced,
      isCurrent: true,
      supersededAt: null,
    })
  }
  // reschedule history: on-site → booked but superseded (#7); sync cancel → cancelled
  for (const sr of srs.filter((s) => s.status === 'reschedule_needed')) {
    const calendarId = calendarIdForRegion(sr.regionId)
    if (!calendarId) continue
    const list = history.get(sr.id)
    const onSite = latest(list, ['reschedule_on_site'])
    const cancelled = latest(list, ['appointment_cancelled', 'request_reschedule'])
    const start = onSite
      ? new Date(Date.parse(onSite.occurredAt) - 20 * 60_000).toISOString()
      : businessInstant(
          addWorkingDays(toBusinessDate(cancelled?.occurredAt ?? businessInstant(today, 9)), 3),
          10,
        )
    const changedAt = onSite?.occurredAt ?? cancelled?.occurredAt ?? synced
    rows.push({
      externalId: externalIdFor(sr.number, start),
      calendarId,
      serviceRequestId: sr.id,
      reference: sr.number,
      status: onSite ? 'booked' : 'cancelled',
      startAt: start,
      endAt: new Date(Date.parse(start) + 3_600_000).toISOString(),
      title: `Hardware rollout visit ${sr.number}`,
      contactName: null,
      contactEmail: null,
      street: sr.deliveryStreet,
      town: sr.deliveryCity,
      notes: onSite ? null : 'Cancelled by the user in the booking portal',
      bookedAt: new Date(Date.parse(start) - 8 * 86_400_000).toISOString(),
      providerUpdatedAt: changedAt,
      source: 'sync',
      lastSyncedAt: synced,
      isCurrent: false,
      supersededAt: onSite ? changedAt : null,
    })
  }
  const unmatchedCalendars = [1, 3, 9, 4, 7]
  UNMATCHED_REFERENCES.forEach((reference, n) => {
    const day = addWorkingDays(anchorDay(today), 5 + n)
    const calendarId = unmatchedCalendars[n % unmatchedCalendars.length] ?? 1
    const start = businessInstant(day, 8 + (pick() % 8), 30)
    const person = name()
    const calendar = db.collection('booking_calendars').get(calendarId)
    rows.push({
      externalId: externalIdFor(`unmatched-${n}-${reference ?? ''}`, start),
      calendarId,
      serviceRequestId: null,
      reference,
      status: 'booked',
      startAt: start,
      endAt: new Date(Date.parse(start) + 3_600_000).toISOString(),
      title: reference ? `Hardware rollout visit ${reference}` : 'Hardware rollout visit',
      contactName: person,
      contactEmail: `${person.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      street: null,
      town: calendar?.name.replace(' route', '') ?? null,
      notes: reference ? 'Reference typed by the user' : 'No order number given',
      bookedAt: new Date(Date.parse(synced) - (1 + (pick() % 4)) * 86_400_000).toISOString(),
      providerUpdatedAt: null,
      source: 'sync',
      lastSyncedAt: synced,
      isCurrent: false,
      supersededAt: null,
    })
  })
  rows.forEach((row) => appointments.insert(row))
}

function seedTours(
  db: DemoDatabase,
  today: string,
  history: Map<number, StatusTransitionRow[]>,
  chance: () => number,
): void {
  const users = db.collection('users').all()
  const userId = (email: string) => users.find((u) => u.email === email)?.id ?? null
  const dana = userId('dana.dispatcher@example.com') ?? 1
  const regionCode = new Map(
    calendarDefs().map((def) => {
      const calendar = db.collection('booking_calendars').find((c) => c.regionId === def.regionId)
      return [calendar?.id ?? def.id, def.code] as const
    }),
  )
  const d0 = anchorDay(today)
  const monday = weekMonday(d0)
  const first = [monday, addWorkingDays(d0, -1)].sort()[0] ?? monday
  const last = addDays(monday, 11)
  const nextWeek = addDays(monday, 7)
  interface Entry {
    srId: number
    outcome: TourStopRow['outcome']
    outcomeAt: string | null
    start: string
  }
  const cells = new Map<string, Entry[]>()
  const push = (calendarId: number, day: string, entry: Entry) => {
    const key = `${day}|${calendarId}`
    cells.set(key, [...(cells.get(key) ?? []), entry])
  }
  // Theo's stops today: the provided Riverton SRs with an appointment on D0
  const riverton = [...regionCode.entries()].find(([, code]) => code === 'riverton')?.[0]
  for (const sr of db.collection('service_requests').all()) {
    if (!sr.appointmentStartAt || !sr.appointmentCalendarId) continue
    const day = toBusinessDate(sr.appointmentStartAt)
    if (day < first || day > last) continue
    if (day < d0) {
      if (sr.status === 'completed')
        push(sr.appointmentCalendarId, day, {
          srId: sr.id,
          outcome: 'completed',
          outcomeAt: sr.completedAt,
          start: sr.appointmentStartAt,
        })
      else if (sr.status === 'cancelled')
        push(sr.appointmentCalendarId, day, {
          srId: sr.id,
          outcome: 'cancelled',
          outcomeAt: sr.cancelledAt,
          start: sr.appointmentStartAt,
        })
      continue // overdue SRs stay out of tours (SPEC_RESOLUTIONS #46)
    }
    if (!WITH_APPT_STATUSES.includes(sr.status)) continue
    if (day === d0 && sr.appointmentCalendarId === riverton && sr.status !== 'provided') continue
    push(sr.appointmentCalendarId, day, {
      srId: sr.id,
      outcome: 'pending',
      outcomeAt: null,
      start: sr.appointmentStartAt,
    })
  }
  for (const row of db.collection('appointments').filter((a) => a.supersededAt !== null)) {
    const day = toBusinessDate(row.startAt)
    if (!row.serviceRequestId || day < first || day >= d0) continue
    const event = latest(history.get(row.serviceRequestId), ['reschedule_on_site'])
    push(row.calendarId, day, {
      srId: row.serviceRequestId,
      outcome: 'rescheduled',
      outcomeAt: event?.occurredAt ?? row.startAt,
      start: row.startAt,
    })
  }
  const tours = db.collection('tours')
  const stops = db.collection('tour_stops')
  const keys = [...cells.keys()].sort()
  for (const key of keys) {
    const [day = d0, rawCalendar = '0'] = key.split('|')
    if (!isWorkingDay(day)) continue
    const calendarId = Number(rawCalendar)
    const entries = (cells.get(key) ?? []).sort(
      (a, b) => a.start.localeCompare(b.start) || a.srId - b.srId,
    )
    const technician = userId(TECHNICIAN_BY_REGION[regionCode.get(calendarId) ?? ''] ?? '')
    const past = day < d0
    const status: TourRow['status'] = past
      ? 'completed'
      : day >= nextWeek && chance() < 0.3
        ? 'draft'
        : 'planned'
    const outcomes = entries.map((e) => e.outcomeAt).filter((v): v is string => Boolean(v))
    const tour = tours.insert({
      calendarId,
      tourDate: day,
      technicianId: status === 'draft' ? null : technician,
      status,
      notes: null,
      startedAt: past
        ? new Date(Date.parse(entries[0]?.start ?? day) - 30 * 60_000).toISOString()
        : null,
      finishedAt: past ? (outcomes.sort().at(-1) ?? null) : null,
      createdBy: dana,
      version: 1,
    })
    entries.forEach((entry, index) =>
      stops.insert({
        tourId: tour.id,
        serviceRequestId: entry.srId,
        position: index + 1,
        outcome: entry.outcome,
        outcomeAt: entry.outcomeAt,
      }),
    )
  }
}

export const seed: SeedDefinition = {
  module: 'field',
  version: 1,
  order: 40,
  run: ({ db, faker, today, fixture }) => {
    const synced = new Date(Date.parse(businessInstant(today, 8)) - 40 * 60_000).toISOString()
    ensureCalendars(db, synced)
    if ((fixture.tables.tours?.length ?? 0) > 0) return // the backend export brought them
    const history = transitionsBySr(db)
    seedAppointments(
      db,
      today,
      history,
      synced,
      () => faker.number.int({ min: 0, max: 1000 }),
      () => {
        // names of the fictional seed vocabulary (no generated real-world names)
        const contacts = db.collection('contacts').all()
        const a = contacts[faker.number.int({ min: 0, max: contacts.length - 1 })]
        const b = contacts[faker.number.int({ min: 0, max: contacts.length - 1 })]
        return `${a?.firstName ?? 'Alex'} ${b?.lastName ?? 'Turner'}`
      },
    )
    seedTours(db, today, history, () => faker.number.float({ min: 0, max: 1 }))
    db.collection('booking_sync_state').insert({
      id: 1,
      syncToken: String(db.collection('appointments').count()),
      lastFullSyncAt: new Date(Date.parse(synced) - 86_400_000).toISOString(),
      lastIncrementalSyncAt: synced,
      lastResult: {
        calendars: db.collection('booking_calendars').count(),
        created: 4,
        updated: 1,
        cancelled: 1,
        matched: 4,
        unmatched: 0,
        transitions: 3,
      },
      lastJobId: null,
    })
  },
}
