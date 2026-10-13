import type {
  AppointmentStatus,
  ID,
  ISODate,
  ISODateTime,
  TourStatus,
  TourStopOutcome,
} from '@/lib/api/types'

/**
 * H4 tables of the demo database (SPEC §5.5) — raw rows, camelCase, exactly as the backend's
 * `hangar seed --export-json` writes them (`booking_calendars` is declared by core).
 */
export interface AppointmentRow {
  id: ID
  externalId: string
  calendarId: ID
  serviceRequestId: ID | null
  reference: string | null
  status: AppointmentStatus
  startAt: ISODateTime
  endAt: ISODateTime
  title: string | null
  contactName: string | null
  contactEmail: string | null
  street: string | null
  town: string | null
  notes: string | null
  bookedAt: ISODateTime | null
  providerUpdatedAt: ISODateTime | null
  source: 'sync' | 'manual'
  lastSyncedAt: ISODateTime | null
  /** The SR's current appointment. */
  isCurrent: boolean
  /** SPEC_RESOLUTIONS #7: superseded bookings never become current again. */
  supersededAt: ISODateTime | null
}

export interface BookingSyncStateRow {
  id: 1
  syncToken: string | null
  lastFullSyncAt: ISODateTime | null
  lastIncrementalSyncAt: ISODateTime | null
  lastResult: SyncCounts | null
  lastJobId: ID | null
}

export interface SyncCounts {
  calendars: number
  created: number
  updated: number
  cancelled: number
  matched: number
  unmatched: number
  transitions: number
}

export interface TourRow {
  id: ID
  calendarId: ID
  tourDate: ISODate
  technicianId: ID | null
  status: TourStatus
  notes: string | null
  startedAt: ISODateTime | null
  finishedAt: ISODateTime | null
  createdBy: ID
  version: number
}

export interface TourStopRow {
  id: ID
  tourId: ID
  serviceRequestId: ID
  position: number
  outcome: TourStopOutcome
  outcomeAt: ISODateTime | null
}

declare module '@/mocks/db' {
  interface DemoCollections {
    appointments: AppointmentRow
    booking_sync_state: BookingSyncStateRow
    tours: TourRow
    tour_stops: TourStopRow
  }
}
