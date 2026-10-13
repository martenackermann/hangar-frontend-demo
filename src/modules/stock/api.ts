import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { api, type Query } from '@/lib/api/client'
import { assetKeys } from '@/lib/api/keys'
import type {
  AssetListItem,
  AssetMovement,
  CallOffCreate,
  CallOffOrder,
  CallOffOrderPatch,
  CallOffOrderSummary,
  DashboardKpis,
  DeactivationBatch,
  DeactivationResult,
  DownloadLink,
  InventoryCloseBody,
  InventoryCreate,
  InventoryDetail,
  InventoryScan,
  InventoryScanBody,
  InventorySummary,
  JobAccepted,
  Page,
  Reconciliation,
  ScanResult,
  StockBuffersPatch,
  StockBuffersResponse,
  StockMatrix,
} from '@/lib/api/types'
import { trackJob } from '@/lib/jobs'
import { createQueryKeys } from '@/lib/query/keys'

/**
 * Public surface of the `stock` module (H5 Stock, Inventory & Dashboard): query keys, query
 * options and mutation hooks for API.md §8. Asset lists/details reuse `assetKeys`.
 */

export const stockKeys = createQueryKeys('stock')
export const calloffKeys = createQueryKeys('calloff-orders')
export const inventoryKeys = createQueryKeys('inventories')
export const deactivationKeys = createQueryKeys('deactivations')
export const dashboardKeys = createQueryKeys('dashboard')

// ---- params ---------------------------------------------------------------------------------

export interface MatrixParams {
  siteId?: number[]
  category?: string[]
  q?: string
  onlyShortfall?: boolean
  includeInactive?: boolean
}

export interface CallOffListParams {
  siteId?: number[]
  status?: string[]
  from?: string
  to?: string
  page?: number
  perPage?: number
  sort?: string
}

export interface AssetListParams {
  q?: string
  status?: string[]
  siteId?: number[]
  locationType?: string[]
  locationId?: number[]
  articleId?: number[]
  category?: string[]
  installationPlace?: string
  hasInstallationPlace?: boolean
  serviceRequestId?: number
  checkedInFrom?: string
  checkedInTo?: string
  source?: string[]
  sort?: string
  page?: number
  perPage?: number
}

/** Drops empty values so query keys and URLs stay canonical. */
export function cleanQuery(params: object): Query {
  const out: Query = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value) && value.length === 0) continue
    out[key] = value as Query[string]
  }
  return out
}

// ---- queries --------------------------------------------------------------------------------

export const stockQueries = {
  matrix: (params: MatrixParams) =>
    queryOptions({
      queryKey: stockKeys.scope('matrix', cleanQuery(params)),
      queryFn: ({ signal }) =>
        api.get<StockMatrix>('/stock/matrix', { query: cleanQuery(params), signal }),
      placeholderData: keepPreviousData,
      refetchInterval: (q) => (q.state.data?.meta.recalculating ? 2000 : false),
    }),
  dashboard: (params: { siteId?: number; regionId?: number }) =>
    queryOptions({
      queryKey: dashboardKeys.scope('kpis', cleanQuery(params)),
      queryFn: ({ signal }) =>
        api.get<DashboardKpis>('/dashboard/kpis', { query: cleanQuery(params), signal }),
      placeholderData: keepPreviousData,
      refetchInterval: 60_000,
    }),
  /**
   * Open VIP requests in the dashboard's scope. The dashboard counts VIP requests, the pipeline
   * hides them by default, so the Open requests tile states how many of its total are VIP.
   */
  dashboardVipOpen: (params: { siteId?: number; regionId?: number }) =>
    queryOptions({
      queryKey: dashboardKeys.scope('vip-open', cleanQuery(params)),
      queryFn: ({ signal }) =>
        api.get<Page<unknown>>('/service-requests', {
          query: { ...cleanQuery(params), vip: 'only', perPage: 1 },
          signal,
        }),
      select: (page) => page.meta.total,
      placeholderData: keepPreviousData,
      refetchInterval: 60_000,
    }),
  calloffList: (params: CallOffListParams) =>
    queryOptions({
      queryKey: calloffKeys.list(cleanQuery(params)),
      queryFn: ({ signal }) =>
        api.get<Page<CallOffOrderSummary>>('/calloff-orders', {
          query: cleanQuery(params),
          signal,
        }),
      placeholderData: keepPreviousData,
    }),
  calloff: (id: number) =>
    queryOptions({
      queryKey: calloffKeys.detail(id),
      queryFn: ({ signal }) => api.get<CallOffOrder>(`/calloff-orders/${id}`, { signal }),
    }),
  assets: (params: AssetListParams) =>
    queryOptions({
      queryKey: assetKeys.list(cleanQuery(params)),
      queryFn: ({ signal }) =>
        api.get<Page<AssetListItem>>('/assets', { query: cleanQuery(params), signal }),
      placeholderData: keepPreviousData,
    }),
  movements: (assetId: number, page: number, perPage = 25) =>
    queryOptions({
      queryKey: assetKeys.scope('movements', assetId, page, perPage),
      queryFn: ({ signal }) =>
        api.get<Page<AssetMovement>>(`/assets/${assetId}/movements`, {
          query: { page, perPage },
          signal,
        }),
      placeholderData: keepPreviousData,
    }),
  deactivations: (page: number) =>
    queryOptions({
      queryKey: deactivationKeys.list({ page }),
      queryFn: ({ signal }) =>
        api.get<Page<DeactivationBatch>>('/deactivations', { query: { page }, signal }),
      placeholderData: keepPreviousData,
    }),
  deactivation: (id: number) =>
    queryOptions({
      queryKey: deactivationKeys.detail(id),
      queryFn: ({ signal }) => api.get<DeactivationResult>(`/deactivations/${id}`, { signal }),
    }),
  inventories: (params: {
    siteId?: number[]
    status?: string[]
    page?: number
    perPage?: number
  }) =>
    queryOptions({
      queryKey: inventoryKeys.list(cleanQuery(params)),
      queryFn: ({ signal }) =>
        api.get<Page<InventorySummary>>('/inventories', { query: cleanQuery(params), signal }),
      placeholderData: keepPreviousData,
    }),
  inventory: (id: number, poll = false) =>
    queryOptions({
      queryKey: inventoryKeys.detail(id),
      queryFn: ({ signal }) => api.get<InventoryDetail>(`/inventories/${id}`, { signal }),
      refetchInterval: poll ? 5000 : false,
    }),
  reconciliation: (id: number, category: string, page: number, perPage = 50) =>
    queryOptions({
      queryKey: inventoryKeys.scope('reconciliation', id, category, page, perPage),
      queryFn: ({ signal }) =>
        api.get<Reconciliation>(`/inventories/${id}/reconciliation`, {
          query: { category, page, perPage },
          signal,
        }),
      placeholderData: keepPreviousData,
    }),
}

// ---- mutations --------------------------------------------------------------------------------

/** `POST /stock/recalculate` → job toast; refreshes the matrix and dashboard when done. */
export async function startRecalculation(queryClient: QueryClient): Promise<void> {
  const accepted = await api.post<JobAccepted>('/stock/recalculate', {})
  void queryClient.invalidateQueries({ queryKey: stockKeys.all })
  void trackJob(queryClient, accepted, {
    title: 'Stock recalculation',
    invalidate: [stockKeys.all, dashboardKeys.all],
    describe: (job) =>
      job.result?.kind === 'stock_recalculate'
        ? `${job.result.articles} articles × ${job.result.sites} hubs in ${job.result.durationMs} ms`
        : undefined,
  })
}

export function useRecalculate() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: () => startRecalculation(queryClient) })
}

export function useUpdateBuffers() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: StockBuffersPatch) =>
      api.patch<StockBuffersResponse>('/stock/buffers', body),
    meta: { invalidates: [stockKeys.all, dashboardKeys.all] },
    onMutate: async (body) => {
      // optimistic: patch every cached matrix showing this hub (SCREENS §7.1)
      await queryClient.cancelQueries({ queryKey: stockKeys.all })
      const snapshots = queryClient.getQueriesData<StockMatrix>({ queryKey: stockKeys.all })
      for (const [key, matrix] of snapshots) {
        if (!matrix?.rows) continue
        queryClient.setQueryData<StockMatrix>(key, {
          ...matrix,
          rows: matrix.rows.map((row) => {
            const entry = body.buffers.find((b) => b.articleId === row.article.id)
            if (!entry) return row
            const cells = row.cells.map((cell) =>
              cell.siteId === body.siteId
                ? {
                    ...cell,
                    buffer: entry.bufferQty,
                    orderQty: Math.max(0, cell.demand + entry.bufferQty - cell.stock),
                  }
                : cell,
            )
            return {
              ...row,
              cells,
              totals: { ...row.totals, orderQty: cells.reduce((s, c) => s + c.orderQty, 0) },
            }
          }),
        })
      }
      return { snapshots }
    },
    onError: (_error, _body, context) => {
      for (const [key, data] of context?.snapshots ?? []) queryClient.setQueryData(key, data)
    },
  })
}

export function useCreateCallOff() {
  return useMutation({
    mutationFn: (body: CallOffCreate) => api.post<CallOffOrder>('/calloff-orders', body),
    meta: { invalidates: [calloffKeys.all], errorToast: false },
  })
}

export function usePatchCallOff(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CallOffOrderPatch) => api.patch<CallOffOrder>(`/calloff-orders/${id}`, body),
    meta: { invalidates: [calloffKeys.lists()], errorToast: false },
    onSuccess: (order) => queryClient.setQueryData(calloffKeys.detail(id), order),
  })
}

export function useCallOffAction(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ action, body }: { action: 'send' | 'cancel'; body?: Record<string, unknown> }) =>
      api.post<CallOffOrder>(`/calloff-orders/${id}/actions/${action}`, body ?? {}),
    meta: { invalidates: [calloffKeys.lists(), stockKeys.all], errorToast: false },
    onSuccess: (order) => queryClient.setQueryData(calloffKeys.detail(id), order),
  })
}

export function useOpenInventory() {
  return useMutation({
    mutationFn: (body: InventoryCreate) => api.post<InventoryDetail>('/inventories', body),
    meta: { invalidates: [inventoryKeys.all, dashboardKeys.all], errorToast: false },
  })
}

export function submitScan(id: number, body: InventoryScanBody) {
  return api.post<ScanResult<InventoryScan>>(`/inventories/${id}/scans`, body)
}

export function useInventoryAction(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      action,
      body,
    }: {
      action: 'close' | 'cancel'
      body: InventoryCloseBody | { comment?: string }
    }) => api.post<InventoryDetail>(`/inventories/${id}/actions/${action}`, body),
    meta: {
      invalidates: [inventoryKeys.all, assetKeys.all, stockKeys.all, dashboardKeys.all],
      errorToast: false,
    },
    onSuccess: (inventory) => queryClient.setQueryData(inventoryKeys.detail(id), inventory),
  })
}

export function useDeactivationUpload() {
  return useMutation({
    mutationFn: ({ file, reason }: { file: File; reason: string }) => {
      const form = new FormData()
      form.append('file', file)
      form.append('reason', reason)
      return api.upload<DeactivationResult>('/deactivations', form)
    },
    meta: {
      invalidates: [deactivationKeys.all, assetKeys.all, stockKeys.all, dashboardKeys.all],
      errorToast: false,
    },
  })
}

/** `POST <path>?<list params>` → DownloadLink (exports keep the list filters). */
export function exportRequest(path: string, params: object) {
  return () => api.post<DownloadLink>(path, {}, { query: cleanQuery(params) })
}
