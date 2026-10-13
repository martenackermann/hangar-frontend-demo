import { queryOptions, useQuery } from '@tanstack/react-query'
import { api, type Query } from './client'
import type {
  AppConfig,
  BackgroundJob,
  DeviationCode,
  EnumsResponse,
  List,
  Me,
  Persona,
  Region,
  SavedView,
  SearchResponse,
  Site,
  StockLocation,
  UserSummary,
} from './types'

/**
 * Query options for the core endpoints (API.md §3). Reference data is cached for the session;
 * screens read it with the hooks below (`useSites()`, `useRegions()`, ...).
 */
export const coreKeys = {
  me: ['me'] as const,
  config: ['meta', 'config'] as const,
  enums: ['meta', 'enums'] as const,
  personas: ['auth', 'personas'] as const,
  sites: ['sites'] as const,
  regions: (params: Query = {}) => ['regions', params] as const,
  stockLocations: (params: Query = {}) => ['stock-locations', params] as const,
  users: (params: Query = {}) => ['users', params] as const,
  deviationCodes: ['deviation-codes'] as const,
  search: (q: string) => ['search', q] as const,
  savedViews: (route: string) => ['saved-views', route] as const,
  savedViewsAll: ['saved-views'] as const,
  job: (id: number) => ['jobs', id] as const,
  runningJobs: ['jobs', 'running'] as const,
}

const forever = { staleTime: Infinity, gcTime: Infinity } as const

export const coreQueries = {
  me: () =>
    queryOptions({
      queryKey: coreKeys.me,
      queryFn: ({ signal }) => api.get<Me>('/me', { signal }),
      ...forever,
    }),
  config: () =>
    queryOptions({
      queryKey: coreKeys.config,
      queryFn: ({ signal }) => api.get<AppConfig>('/meta/config', { signal }),
      ...forever,
    }),
  enums: () =>
    queryOptions({
      queryKey: coreKeys.enums,
      queryFn: ({ signal }) => api.get<EnumsResponse>('/meta/enums', { signal }),
      ...forever,
    }),
  personas: () =>
    queryOptions({
      queryKey: coreKeys.personas,
      queryFn: ({ signal }) => api.get<List<Persona>>('/auth/personas', { signal }),
      staleTime: 5 * 60_000,
      retry: false,
    }),
  sites: () =>
    queryOptions({
      queryKey: coreKeys.sites,
      queryFn: ({ signal }) => api.get<List<Site>>('/sites', { signal }),
      staleTime: 10 * 60_000,
    }),
  regions: (params: { active?: 'true' | 'false' | 'all' } = {}) =>
    queryOptions({
      queryKey: coreKeys.regions(params),
      queryFn: ({ signal }) => api.get<List<Region>>('/regions', { query: params, signal }),
      staleTime: 10 * 60_000,
    }),
  stockLocations: (params: { siteId?: number; type?: string[] } = {}) =>
    queryOptions({
      queryKey: coreKeys.stockLocations(params),
      queryFn: ({ signal }) =>
        api.get<List<StockLocation>>('/stock-locations', { query: params, signal }),
      staleTime: 10 * 60_000,
    }),
  users: (params: { role?: string[]; active?: 'true' | 'false' | 'all'; q?: string } = {}) =>
    queryOptions({
      queryKey: coreKeys.users(params),
      queryFn: ({ signal }) => api.get<List<UserSummary>>('/users', { query: params, signal }),
      staleTime: 5 * 60_000,
    }),
  deviationCodes: () =>
    queryOptions({
      queryKey: coreKeys.deviationCodes,
      queryFn: ({ signal }) => api.get<List<DeviationCode>>('/deviation-codes', { signal }),
      ...forever,
    }),
  search: (q: string) =>
    queryOptions({
      queryKey: coreKeys.search(q),
      queryFn: ({ signal }) =>
        api.get<SearchResponse>('/search', { query: { q, limit: 20 }, signal }),
      staleTime: 15_000,
      enabled: q.trim().length >= 2,
    }),
  savedViews: (route: string) =>
    queryOptions({
      queryKey: coreKeys.savedViews(route),
      queryFn: ({ signal }) =>
        api.get<List<SavedView>>('/saved-views', { query: { route }, signal }),
      staleTime: 60_000,
    }),
  job: (id: number) =>
    queryOptions({
      queryKey: coreKeys.job(id),
      queryFn: ({ signal }) => api.get<BackgroundJob>(`/jobs/${id}`, { signal }),
      // Poll every second while the job runs (API.md §1.7).
      refetchInterval: (query) =>
        query.state.data && !['queued', 'running'].includes(query.state.data.status) ? false : 1000,
    }),
  /** Running jobs of the current user (SPEC_RESOLUTIONS #23) for the top-bar indicator. */
  runningJobs: () =>
    queryOptions({
      queryKey: coreKeys.runningJobs,
      queryFn: ({ signal }) =>
        api.get<List<BackgroundJob>>('/jobs', {
          query: { mine: true, status: ['queued', 'running'] },
          signal,
        }),
      refetchInterval: (query) => ((query.state.data?.data.length ?? 0) > 0 ? 2000 : 30_000),
      retry: false,
    }),
}

export function useAppConfig(): AppConfig | undefined {
  return useQuery(coreQueries.config()).data
}

export function useSites(): Site[] {
  return useQuery(coreQueries.sites()).data?.data ?? EMPTY
}

/** Hubs only (Riverton, Hillford, Eastgate), in sort order. */
export function useHubs(): Site[] {
  return useSites().filter((site) => site.kind === 'hub')
}

export function useRegions(): Region[] {
  return useQuery(coreQueries.regions()).data?.data ?? EMPTY
}

export function useStockLocations(
  params: { siteId?: number; type?: string[] } = {},
): StockLocation[] {
  return useQuery(coreQueries.stockLocations(params)).data?.data ?? EMPTY
}

export function useUsers(
  params: { role?: string[]; active?: 'true' | 'false' | 'all'; q?: string } = {},
): UserSummary[] {
  return useQuery(coreQueries.users(params)).data?.data ?? EMPTY
}

export function useDeviationCodes(): DeviationCode[] {
  return useQuery(coreQueries.deviationCodes()).data?.data ?? EMPTY
}

const EMPTY: never[] = []
