import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Query } from '@/lib/api/client'
import { contactKeys, leaseKeys, mailKeys, srKeys } from '@/lib/api/keys'
import type {
  ContactDetail,
  ContactPatch,
  DispatchRun,
  DispatchSettings,
  DispatchSettingsInput,
  HistoryEntry,
  JobAccepted,
  LeaseReturnComment,
  LeaseReturnDetail,
  LeaseReturnListItem,
  LeaseReturnPatch,
  List,
  MailLogDetail,
  MailLogEntry,
  NotificationTemplateInfo,
  NotificationTemplatePreview,
  Page,
  PipelineSummary,
  ServiceRequestDetail,
  ServiceRequestListItem,
  ServiceRequestPatch,
} from '@/lib/api/types'
import { createQueryKeys } from '@/lib/query/keys'

/**
 * Public surface of the `requests` module (H1 Requests & Comms): query keys, query options,
 * mutation hooks and the few response extensions the H1 backend adds on top of API.md.
 */

export const pipelineKeys = createQueryKeys('pipeline')
export const commsKeys = createQueryKeys('comms')

// ---- response extensions (additive fields of the H1 backend) -----------------------------------

export interface AgingSplit {
  onTime: number
  aging: number
  overdue: number
}

/** `/pipeline/summary` + per-stage aging/flow, 12-day trends and lead time (H1 additive). */
export interface PipelineSummaryExt extends Omit<PipelineSummary, 'stages' | 'totals'> {
  stages: (PipelineSummary['stages'][number] & { enteredLast24h: number; aging: AgingSplit })[]
  totals: PipelineSummary['totals'] & { leadTimeDays: number | null }
  trends: { days: string[]; open: number[]; imported: number[]; completed: number[] } | null
}

/** Template info + the entity type a preview can be rendered with (H1 additive). */
export interface NotificationTemplateInfoExt extends Omit<NotificationTemplateInfo, 'owner'> {
  owner: NotificationTemplateInfo['owner'] | 'core'
  entityType?: 'service_request' | 'lease_return' | null
}

// ---- helpers -----------------------------------------------------------------------------------

/** Search params the API does not know (UI state) are dropped before calling the API. */
const UI_KEYS = new Set(['view', 'sr', 'lr', 'asset', 'mail', 'tab', 'board', 'cols'])

export function apiQuery(search: Record<string, unknown>): Query {
  const query: Query = {}
  for (const [key, value] of Object.entries(search)) {
    if (UI_KEYS.has(key) || value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) query[key] = value as (string | number)[]
    else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
      query[key] = value
  }
  return query
}

// ---- service requests --------------------------------------------------------------------------

export function srListQuery(query: Query) {
  return queryOptions({
    queryKey: srKeys.list(query),
    queryFn: ({ signal }) =>
      api.get<Page<ServiceRequestListItem>>('/service-requests', { query, signal }),
    placeholderData: keepPreviousData,
  })
}

export function srHistoryQuery(id: number) {
  return queryOptions({
    queryKey: srKeys.scope('history', id),
    queryFn: ({ signal }) =>
      api.get<List<HistoryEntry>>(`/service-requests/${id}/history`, { signal }),
  })
}

export function srByNumber(number: string) {
  return api.get<ServiceRequestDetail>(`/service-requests/by-number/${encodeURIComponent(number)}`)
}

export function usePatchServiceRequest(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ServiceRequestPatch) =>
      api.patch<ServiceRequestDetail>(`/service-requests/${id}`, body),
    meta: { invalidates: [srKeys.all, pipelineKeys.all], errorToast: false },
    onSuccess: (updated) => queryClient.setQueryData(srKeys.detail(id), updated),
  })
}

// ---- lease returns -----------------------------------------------------------------------------

export function leaseListQuery(query: Query) {
  return queryOptions({
    queryKey: leaseKeys.list(query),
    queryFn: ({ signal }) =>
      api.get<Page<LeaseReturnListItem>>('/lease-returns', { query, signal }),
    placeholderData: keepPreviousData,
  })
}

export function leaseCommentsQuery(id: number) {
  return queryOptions({
    queryKey: leaseKeys.scope('comments', id),
    queryFn: ({ signal }) =>
      api.get<List<LeaseReturnComment>>(`/lease-returns/${id}/comments`, { signal }),
  })
}

export function leaseHistoryQuery(id: number) {
  return queryOptions({
    queryKey: leaseKeys.scope('history', id),
    queryFn: ({ signal }) => api.get<List<HistoryEntry>>(`/lease-returns/${id}/history`, { signal }),
  })
}

export function usePatchLeaseReturn(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: LeaseReturnPatch) =>
      api.patch<LeaseReturnDetail>(`/lease-returns/${id}`, body),
    meta: { invalidates: [leaseKeys.all], errorToast: false },
    onSuccess: (updated) => queryClient.setQueryData(leaseKeys.detail(id), updated),
  })
}

export function useAddLeaseComment(id: number) {
  return useMutation({
    mutationFn: (body: string) =>
      api.post<LeaseReturnComment>(`/lease-returns/${id}/comments`, { body }),
    meta: { invalidates: [leaseKeys.all], errorToast: false },
  })
}

// ---- contacts ----------------------------------------------------------------------------------

export function contactQuery(id: number) {
  return queryOptions({
    queryKey: contactKeys.detail(id),
    queryFn: ({ signal }) => api.get<ContactDetail>(`/contacts/${id}`, { signal }),
  })
}

export function usePatchContact(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ContactPatch) => api.patch<ContactDetail>(`/contacts/${id}`, body),
    meta: { invalidates: [contactKeys.all, srKeys.all, leaseKeys.all], errorToast: false },
    onSuccess: (updated) => queryClient.setQueryData(contactKeys.detail(id), updated),
  })
}

// ---- pipeline ------------------------------------------------------------------------------------

export function pipelineSummaryQuery(query: Query) {
  return queryOptions({
    queryKey: pipelineKeys.scope('summary', query),
    queryFn: ({ signal }) => api.get<PipelineSummaryExt>('/pipeline/summary', { query, signal }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })
}

// ---- communications ------------------------------------------------------------------------------

export function mailLogQuery(query: Query) {
  return queryOptions({
    queryKey: mailKeys.list(query),
    queryFn: ({ signal }) => api.get<Page<MailLogEntry>>('/mail-log', { query, signal }),
    placeholderData: keepPreviousData,
  })
}

export function mailDetailQuery(id: number) {
  return queryOptions({
    queryKey: mailKeys.detail(id),
    queryFn: ({ signal }) => api.get<MailLogDetail>(`/mail-log/${id}`, { signal }),
  })
}

export const dispatchSettingsQuery = queryOptions({
  queryKey: commsKeys.scope('settings'),
  queryFn: ({ signal }) => api.get<DispatchSettings>('/dispatch-settings', { signal }),
})

export function dispatchRunsQuery(query: Query) {
  return queryOptions({
    queryKey: commsKeys.scope('runs', query),
    queryFn: ({ signal }) =>
      api.get<Page<DispatchRun>>('/comms/dispatch-runs', { query, signal }),
    placeholderData: keepPreviousData,
  })
}

export function dispatchRunQuery(id: number) {
  return queryOptions({
    queryKey: commsKeys.scope('run', id),
    queryFn: ({ signal }) => api.get<DispatchRun>(`/comms/dispatch-runs/${id}`, { signal }),
  })
}

export const templatesQuery = queryOptions({
  queryKey: commsKeys.scope('templates'),
  queryFn: ({ signal }) =>
    api.get<List<NotificationTemplateInfoExt>>('/notification-templates', { signal }),
})

export function templatePreviewQuery(
  templateId: string,
  entity?: { type: 'service_request' | 'lease_return'; id: number } | null,
) {
  return queryOptions({
    queryKey: commsKeys.scope('preview', templateId, entity?.type ?? null, entity?.id ?? null),
    queryFn: ({ signal }) =>
      api.get<NotificationTemplatePreview>(
        `/notification-templates/${encodeURIComponent(templateId)}/preview`,
        { query: entity ? { entityType: entity.type, entityId: entity.id } : undefined, signal },
      ),
  })
}

export function useSaveDispatchSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: DispatchSettingsInput) =>
      api.put<DispatchSettings>('/dispatch-settings', body),
    meta: { errorToast: false, successToast: 'Dispatch settings saved' },
    onSuccess: (saved) => queryClient.setQueryData(commsKeys.scope('settings'), saved),
  })
}

/** `POST /comms/dispatch-runs {dryRun: true}` → the stored dry run with `planned`. */
export function useDryRun() {
  return useMutation({
    mutationFn: () => api.post<DispatchRun>('/comms/dispatch-runs', { dryRun: true }),
    meta: { invalidates: [commsKeys.all] },
  })
}

/** `POST /comms/dispatch-runs {dryRun: false}` → `202 JobAccepted` (track the job). */
export function useRunDispatch() {
  return useMutation({
    mutationFn: () => api.post<JobAccepted>('/comms/dispatch-runs', { dryRun: false }),
    meta: { invalidates: [commsKeys.all], errorToast: false },
  })
}

/** Everything a finished dispatch run changes. */
export const DISPATCH_INVALIDATES = [
  commsKeys.all,
  mailKeys.all,
  srKeys.all,
  leaseKeys.all,
  pipelineKeys.all,
] as const
