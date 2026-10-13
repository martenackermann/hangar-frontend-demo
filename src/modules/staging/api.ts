import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Query } from '@/lib/api/client'
import { assetKeys, srKeys } from '@/lib/api/keys'
import { createQueryKeys } from '@/lib/query/keys'
import type {
  AssetCandidates,
  AssetSummary,
  InstallationPlaceOccupancy,
  ItemSlot,
  OrderClosingQueueItem,
  OsReinstallTiming,
  Page,
  ParcelPickingItem,
  PersonalizationQueueItem,
  ScanResult,
  ServiceRequestDetail,
  ServiceRequestItem,
  Shipment,
  ShipmentCreate,
  ShipmentCreated,
  SoftwareChecklist,
  TechnicianPicking,
} from '@/lib/api/types'

/**
 * Public surface of the `staging` module (H3 Staging & Fulfilment, API.md §6).
 *
 * Queries about service requests live under `srKeys` so every SR change (drawer actions, bulk
 * actions, scans) refreshes the queues; installation places under `assetKeys`.
 */

export const shipmentKeys = createQueryKeys('shipments')

export const stagingKeys = {
  personalization: (params: Query) => srKeys.scope('personalization', params),
  candidates: (srId: number, slot: ItemSlot) => srKeys.scope('asset-candidates', srId, slot),
  checklist: (srId: number) => srKeys.scope('software-checklist', srId),
  orderClosing: (params: Query) => srKeys.scope('order-closing', params),
  technicianPicking: (params: Query) => srKeys.scope('picking-technician', params),
  parcelPicking: (params: Query) => srKeys.scope('picking-parcel', params),
  srShipments: (srId: number) => srKeys.scope('shipments', srId),
  places: (params: Query) => assetKeys.scope('installation-places', params),
}

interface List<T> {
  data: T[]
}

// ---- queries ---------------------------------------------------------------------------------

export const stagingQueries = {
  installationPlaces: (params: { siteId?: number; q?: string }) =>
    queryOptions({
      queryKey: stagingKeys.places(params),
      queryFn: ({ signal }) =>
        api.get<List<InstallationPlaceOccupancy>>('/staging/installation-places', {
          query: params,
          signal,
        }),
      placeholderData: keepPreviousData,
    }),
  personalizationQueue: (params: Query) =>
    queryOptions({
      queryKey: stagingKeys.personalization(params),
      queryFn: ({ signal }) =>
        api.get<Page<PersonalizationQueueItem>>('/personalization/queue', {
          query: params,
          signal,
        }),
      placeholderData: keepPreviousData,
    }),
  candidates: (srId: number, slot: ItemSlot) =>
    queryOptions({
      queryKey: stagingKeys.candidates(srId, slot),
      queryFn: ({ signal }) =>
        api.get<AssetCandidates>(`/service-requests/${srId}/asset-candidates`, {
          query: { slot },
          signal,
        }),
    }),
  checklist: (srId: number) =>
    queryOptions({
      queryKey: stagingKeys.checklist(srId),
      queryFn: ({ signal }) =>
        api.get<SoftwareChecklist>(`/service-requests/${srId}/software-checklist`, { signal }),
    }),
  orderClosing: (params: Query) =>
    queryOptions({
      queryKey: stagingKeys.orderClosing(params),
      queryFn: ({ signal }) =>
        api.get<Page<OrderClosingQueueItem>>('/order-closing/queue', { query: params, signal }),
      placeholderData: keepPreviousData,
    }),
  technicianPicking: (params: { siteId: number; date?: string | undefined }) =>
    queryOptions({
      queryKey: stagingKeys.technicianPicking(params),
      queryFn: ({ signal }) =>
        api.get<TechnicianPicking>('/picking/technician', { query: params, signal }),
      placeholderData: keepPreviousData,
    }),
  parcelPicking: (params: Query) =>
    queryOptions({
      queryKey: stagingKeys.parcelPicking(params),
      queryFn: ({ signal }) =>
        api.get<List<ParcelPickingItem>>('/picking/parcel', { query: params, signal }),
      placeholderData: keepPreviousData,
    }),
  srShipments: (srId: number) =>
    queryOptions({
      queryKey: stagingKeys.srShipments(srId),
      queryFn: ({ signal }) =>
        api.get<List<Shipment>>(`/service-requests/${srId}/shipments`, { signal }),
    }),
  shipments: (params: Query) =>
    queryOptions({
      queryKey: shipmentKeys.list(params),
      queryFn: ({ signal }) => api.get<Page<Shipment>>('/shipments', { query: params, signal }),
      placeholderData: keepPreviousData,
    }),
}

// ---- scan endpoints (one request per scan: the ScanStation `submit`) ---------------------------

export function scanInstallationPlace(body: { siteId: number; serial: string; place: string }) {
  return api.post<ScanResult<AssetSummary>>('/scan/installation-place', body)
}

export function scanAssignment(srId: number, slot: ItemSlot, serial: string) {
  return api.post<ScanResult<ServiceRequestItem>>(
    `/service-requests/${srId}/items/${slot}/assignment`,
    { serial },
  )
}

export function scanParcel(serviceRequestId: number, serial: string) {
  return api.post<ScanResult<ServiceRequestItem>>('/scan/parcel', { serviceRequestId, serial })
}

// ---- mutations --------------------------------------------------------------------------------

export function useUnassign(srId: number) {
  return useMutation({
    mutationFn: (slot: ItemSlot) =>
      api.delete<ServiceRequestItem>(`/service-requests/${srId}/items/${slot}/assignment`),
    meta: { invalidates: [srKeys.all, assetKeys.all], successToast: 'Device unassigned' },
  })
}

export function useUnpack(srId: number) {
  return useMutation({
    mutationFn: (slot: ItemSlot) =>
      api.delete<ServiceRequestItem>(`/service-requests/${srId}/items/${slot}/packing`),
    meta: { invalidates: [srKeys.all], successToast: 'Packed mark removed' },
  })
}

/** `PATCH /service-requests/{id}/staging`: API.md body plus the optional `addedSoftware`. */
export interface StagingOptionsPatch {
  osReinstall?: OsReinstallTiming | null
  addedSoftware?: string[]
  version?: number
}

export function usePatchStaging(srId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: StagingOptionsPatch) =>
      api.patch<ServiceRequestDetail>(`/service-requests/${srId}/staging`, body),
    onSuccess: (detail) => queryClient.setQueryData(srKeys.detail(srId), detail),
    meta: { invalidates: [srKeys.all] },
  })
}

export function usePutChecklist(srId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { installedSoftware: string[]; addedSoftware: string[] }) =>
      api.put<SoftwareChecklist>(`/service-requests/${srId}/software-checklist`, body),
    onSuccess: (checklist) => queryClient.setQueryData(stagingKeys.checklist(srId), checklist),
    meta: { invalidates: [srKeys.all] },
  })
}

export function useCreateShipment(srId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ShipmentCreate) =>
      api.post<ShipmentCreated>(`/service-requests/${srId}/shipments`, body),
    onSuccess: (created) => queryClient.setQueryData(srKeys.detail(srId), created.serviceRequest),
    meta: { invalidates: [srKeys.all, assetKeys.all, shipmentKeys.all], errorToast: false },
  })
}

export type { Shipment, ShipmentCreated }
