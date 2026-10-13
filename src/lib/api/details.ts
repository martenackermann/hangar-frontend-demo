import { queryOptions } from '@tanstack/react-query'
import { api } from './client'
import { assetKeys, leaseKeys, srKeys } from './keys'
import type { AssetDetail, LeaseReturnDetail, ServiceRequestDetail } from './types'

/**
 * Detail queries of the workflow resources, shared by the drawer frames (core) and the slices.
 * After an action, write the returned detail with `queryClient.setQueryData(...)` and
 * invalidate `srKeys.all` (lists, pipeline, queues).
 */
export const detailQueries = {
  serviceRequest: (id: number) =>
    queryOptions({
      queryKey: srKeys.detail(id),
      queryFn: ({ signal }) => api.get<ServiceRequestDetail>(`/service-requests/${id}`, { signal }),
    }),
  leaseReturn: (id: number) =>
    queryOptions({
      queryKey: leaseKeys.detail(id),
      queryFn: ({ signal }) => api.get<LeaseReturnDetail>(`/lease-returns/${id}`, { signal }),
    }),
  asset: (id: number) =>
    queryOptions({
      queryKey: assetKeys.detail(id),
      queryFn: ({ signal }) => api.get<AssetDetail>(`/assets/${id}`, { signal }),
    }),
}
