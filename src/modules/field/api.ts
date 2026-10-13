import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { notify } from '@/components/ui/toast'
import { api, type Query } from '@/lib/api/client'
import { assetKeys, leaseKeys, srKeys } from '@/lib/api/keys'
import type {
  Appointment,
  AppointmentLinkBody,
  BookingCalendar,
  BookingCalendarPatch,
  DeploymentView,
  ID,
  ISODate,
  JobAccepted,
  List,
  Page,
  ProtocolSendResponse,
  ScanResult,
  ServiceRequestItem,
  SyncState,
  TourCandidates,
  TourCreate,
  TourDetail,
  TourPatch,
  TourPlannerOverview,
  TourStatus,
  TourStopOutcome,
  TourSummary,
} from '@/lib/api/types'
import { trackJob } from '@/lib/jobs'
import { createQueryKeys } from '@/lib/query/keys'
import { PERSIST_MAX_AGE } from '@/lib/query/persist'

/**
 * Public surface of the `field` module (H4 Field service, API.md §7): query keys, query
 * options and mutation hooks. Other modules may import from here only.
 */

export const tourKeys = createQueryKeys('tours')
export const appointmentKeys = createQueryKeys('appointments')
export const calendarKeys = createQueryKeys('booking-calendars')
export const plannerKeys = createQueryKeys('tour-planner')
export const myTourKeys = createQueryKeys('my-tours')
export const deploymentKeys = createQueryKeys('deployment')
/** Same key as the top-bar sync indicator (foundation). */
export const syncStateKey = ['appointments', 'sync-state'] as const

/** `GET /service-requests/{id}/tour-stops` item (SPEC_RESOLUTIONS #21). */
export interface TourStopRef {
  tourId: ID
  stopId: ID
  tourDate: ISODate
  technicianName: string | null
  status: TourStatus
  outcome: TourStopOutcome
}

/** Everything that changes when a tour, a stop or an appointment changes. */
export const FIELD_INVALIDATES = [
  tourKeys.all,
  plannerKeys.all,
  myTourKeys.all,
  deploymentKeys.all,
  appointmentKeys.all,
  calendarKeys.all,
  srKeys.all,
] as const

// ---- queries ---------------------------------------------------------------------------------------

export const fieldQueries = {
  calendars: () =>
    queryOptions({
      queryKey: calendarKeys.lists(),
      queryFn: ({ signal }) => api.get<List<BookingCalendar>>('/booking-calendars', { signal }),
      staleTime: 60_000,
    }),
  appointments: (params: Query) =>
    queryOptions({
      queryKey: appointmentKeys.list(params),
      queryFn: ({ signal }) =>
        api.get<Page<Appointment>>('/appointments', { signal, query: params }),
    }),
  srAppointments: (srId: ID) =>
    queryOptions({
      queryKey: appointmentKeys.scope('service-request', srId),
      queryFn: ({ signal }) =>
        api.get<List<Appointment>>(`/service-requests/${srId}/appointments`, { signal }),
    }),
  srTourStops: (srId: ID) =>
    queryOptions({
      queryKey: tourKeys.scope('service-request', srId),
      queryFn: ({ signal }) =>
        api.get<List<TourStopRef>>(`/service-requests/${srId}/tour-stops`, { signal }),
    }),
  syncState: () =>
    queryOptions({
      queryKey: syncStateKey,
      queryFn: ({ signal }) => api.get<SyncState>('/appointments/sync-state', { signal }),
    }),
  tours: (params: Query) =>
    queryOptions({
      queryKey: tourKeys.list(params),
      queryFn: ({ signal }) => api.get<Page<TourSummary>>('/tours', { signal, query: params }),
    }),
  tour: (id: ID) =>
    queryOptions({
      queryKey: tourKeys.detail(id),
      queryFn: ({ signal }) => api.get<TourDetail>(`/tours/${id}`, { signal }),
    }),
  overview: (params: { from: ISODate; to: ISODate; regionId?: ID[] }) =>
    queryOptions({
      queryKey: plannerKeys.scope('overview', params),
      queryFn: ({ signal }) =>
        api.get<TourPlannerOverview>('/tour-planner/overview', {
          signal,
          query: { from: params.from, to: params.to, regionId: params.regionId },
        }),
    }),
  candidates: (calendarId: ID, date: ISODate) =>
    queryOptions({
      queryKey: plannerKeys.scope('candidates', calendarId, date),
      queryFn: ({ signal }) =>
        api.get<TourCandidates>('/tour-planner/candidates', {
          signal,
          query: { calendarId, date },
        }),
    }),
  // My tour and its stops keep an offline copy (SCREENS.md §6.2, `@/lib/query/persist`).
  myTours: (date: ISODate) =>
    queryOptions({
      queryKey: myTourKeys.list({ date }),
      queryFn: ({ signal }) => api.get<List<TourDetail>>('/my/tours', { signal, query: { date } }),
      meta: { persist: true },
      gcTime: PERSIST_MAX_AGE,
    }),
  deployment: (tourId: ID, stopId: ID) =>
    queryOptions({
      queryKey: deploymentKeys.detail(`${tourId}:${stopId}`),
      queryFn: ({ signal }) =>
        api.get<DeploymentView>(`/tours/${tourId}/stops/${stopId}/deployment`, { signal }),
      meta: { persist: true },
      gcTime: PERSIST_MAX_AGE,
    }),
}

// ---- mutations --------------------------------------------------------------------------------------

export async function invalidateField(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    [...FIELD_INVALIDATES, assetKeys.all, leaseKeys.all].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  )
}

/** `POST /appointments/sync` → job toast (⌘K "Sync appointments now", planner sync panel). */
export async function startAppointmentSync(queryClient: QueryClient): Promise<void> {
  const accepted = await api.post<JobAccepted>('/appointments/sync', {})
  void queryClient.invalidateQueries({ queryKey: syncStateKey })
  await trackJob(queryClient, accepted, {
    title: 'Appointment sync',
    invalidate: [syncStateKey, ...FIELD_INVALIDATES],
    describe: (job) =>
      job.result?.kind === 'appointments_sync'
        ? `${job.result.created} new · ${job.result.cancelled} cancelled · ${job.result.transitions} status changes`
        : undefined,
  })
}

export function useSyncAppointments() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => startAppointmentSync(queryClient),
  })
}

export function usePatchCalendar() {
  return useMutation({
    mutationFn: ({ id, patch }: { id: ID; patch: BookingCalendarPatch }) =>
      api.patch<BookingCalendar>(`/booking-calendars/${id}`, patch),
    meta: { invalidates: [calendarKeys.all, plannerKeys.all] },
  })
}

export function useLinkAppointment() {
  return useMutation({
    mutationFn: ({ id, body }: { id: ID; body: AppointmentLinkBody }) =>
      api.post<Appointment>(`/appointments/${id}/link`, body),
    meta: { invalidates: FIELD_INVALIDATES, errorToast: false },
  })
}

export function useCreateTour() {
  return useMutation({
    mutationFn: (body: TourCreate) => api.post<TourDetail>('/tours', body),
    meta: { invalidates: FIELD_INVALIDATES },
  })
}

export function usePatchTour() {
  return useMutation({
    mutationFn: ({ id, body }: { id: ID; body: TourPatch }) =>
      api.patch<TourDetail>(`/tours/${id}`, body),
    meta: { invalidates: FIELD_INVALIDATES },
  })
}

export function usePutStops() {
  return useMutation({
    mutationFn: ({ id, serviceRequestIds }: { id: ID; serviceRequestIds: ID[] }) =>
      api.put<TourDetail>(`/tours/${id}/stops`, { serviceRequestIds }),
    meta: { invalidates: FIELD_INVALIDATES },
  })
}

export function useTourAction() {
  return useMutation({
    mutationFn: ({
      id,
      action,
      version,
    }: {
      id: ID
      action: 'start' | 'finish' | 'cancel'
      version?: number
    }) =>
      api.post<TourDetail>(
        `/tours/${id}/actions/${action}`,
        version === undefined ? {} : { version },
      ),
    meta: { invalidates: FIELD_INVALIDATES },
  })
}

export function scanDeployment(
  serviceRequestId: ID,
  serial: string,
): Promise<ScanResult<ServiceRequestItem>> {
  return api.post<ScanResult<ServiceRequestItem>>('/scan/deployment', {
    serviceRequestId,
    serial,
  })
}

export function useRegisterUnknown() {
  return useMutation({
    mutationFn: ({
      srId,
      slot,
      serial,
      assetTag,
      model,
    }: {
      srId: ID
      slot: string
      serial: string
      assetTag?: string | null
      model?: string | null
    }) =>
      api.post<ServiceRequestItem>(`/service-requests/${srId}/items/${slot}/register-unknown`, {
        serial,
        assetTag: assetTag ?? null,
        model: model ?? null,
      }),
    meta: { invalidates: [...FIELD_INVALIDATES, assetKeys.all], errorToast: false },
  })
}

export function useUndoVerification() {
  return useMutation({
    mutationFn: ({ srId, slot }: { srId: ID; slot: string }) =>
      api.delete<ServiceRequestItem>(`/service-requests/${srId}/items/${slot}/verification`),
    meta: { invalidates: FIELD_INVALIDATES },
  })
}

export function useSendProtocol() {
  return useMutation({
    mutationFn: ({ srId, email }: { srId: ID; email?: string | null }) =>
      api.post<ProtocolSendResponse>(`/service-requests/${srId}/protocol/send`, {
        email: email ?? null,
      }),
    onSuccess: () => notify.success('Protocol sent'),
  })
}
