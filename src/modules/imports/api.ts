import { keepPreviousData, queryOptions, useMutation } from '@tanstack/react-query'
import { api, type Query } from '@/lib/api/client'
import { coreKeys } from '@/lib/api/core'
import { assetKeys, contactKeys, leaseKeys, srKeys } from '@/lib/api/keys'
import type {
  Article,
  ArticleDetail,
  ArticleInput,
  ArticleSiteSetting,
  ArticleSiteSettingPatch,
  DownloadLink,
  ImportDetection,
  ImportGenerateSampleBody,
  ImportJobDetail,
  ImportJobSummary,
  ImportOptions,
  ImportRowIssue,
  ImportTemplate,
  ImportType,
  JobAccepted,
  List,
  Page,
  RegionDetail,
  RegionPatch,
  RegionResolutionResult,
  RegionRule,
  RegionRuleInput,
  RegionRuleTestBody,
  UserCreate,
  UserPatch,
  UserSummary,
  VipEntry,
  VipEntryInput,
} from '@/lib/api/types'
import { createQueryKeys } from '@/lib/query/keys'

/**
 * Public surface of the `imports` module (H2 Import & Master data, API.md §5): query keys,
 * query options and mutation hooks for imports, articles, regions + rules, the VIP list and
 * user administration.
 */
export const importKeys = createQueryKeys('imports')
export const articleKeys = createQueryKeys('articles')
export const regionKeys = createQueryKeys('regions')
export const ruleKeys = createQueryKeys('region-rules')
export const vipKeys = createQueryKeys('vip-entries')
/** Prefix `['users']` also covers the core `GET /users` queries. */
export const userKeys = createQueryKeys('users')

export const ACTIVE_IMPORT_STATUSES: ReadonlySet<string> = new Set(['queued', 'processing'])

// ---- imports ----------------------------------------------------------------------------------

export interface ImportListParams extends Query {
  type?: string[]
  status?: string[]
  from?: string
  to?: string
  page?: number
  perPage?: number
  sort?: string
}

export interface ImportIssueParams extends Query {
  severity?: string
  code?: string[]
  page?: number
  perPage?: number
}

export const importQueries = {
  list: (params: ImportListParams) =>
    queryOptions({
      queryKey: importKeys.list(params),
      queryFn: ({ signal }) =>
        api.get<Page<ImportJobSummary>>('/imports', { query: params, signal }),
      placeholderData: keepPreviousData,
      // keep the progress bars of running imports live
      refetchInterval: (query) =>
        query.state.data?.data.some((job) => ACTIVE_IMPORT_STATUSES.has(job.status)) ? 2000 : false,
    }),
  detail: (id: number) =>
    queryOptions({
      queryKey: importKeys.detail(id),
      queryFn: ({ signal }) => api.get<ImportJobDetail>(`/imports/${id}`, { signal }),
      refetchInterval: (query) =>
        query.state.data && ACTIVE_IMPORT_STATUSES.has(query.state.data.status) ? 1000 : false,
    }),
  errors: (id: number, params: ImportIssueParams) =>
    queryOptions({
      queryKey: importKeys.scope('errors', id, params),
      queryFn: ({ signal }) =>
        api.get<Page<ImportRowIssue>>(`/imports/${id}/errors`, { query: params, signal }),
      placeholderData: keepPreviousData,
    }),
  templates: () =>
    queryOptions({
      queryKey: importKeys.scope('templates'),
      queryFn: ({ signal }) => api.get<List<ImportTemplate>>('/imports/templates', { signal }),
      staleTime: Infinity,
    }),
}

export function detectImport(file: File): Promise<ImportDetection> {
  const form = new FormData()
  form.append('file', file)
  return api.upload<ImportDetection>('/imports/detect', form)
}

export interface StartImportInput {
  file: File
  type?: ImportType | undefined
  options: ImportOptions
}

export function useStartImport() {
  return useMutation({
    mutationFn: ({ file, type, options }: StartImportInput) => {
      const form = new FormData()
      form.append('file', file)
      if (type) form.append('type', type)
      form.append('options', JSON.stringify(options))
      return api.upload<JobAccepted & { importJobId: number }>('/imports', form)
    },
    meta: { invalidates: [importKeys.lists(), coreKeys.runningJobs], errorToast: false },
  })
}

/** Everything a finished import may have changed (requests, leases, assets, contacts, articles). */
export const IMPORT_EFFECT_KEYS = [
  importKeys.all,
  srKeys.all,
  leaseKeys.all,
  assetKeys.all,
  contactKeys.all,
  articleKeys.all,
] as const

export function useCancelImport() {
  return useMutation({
    mutationFn: (id: number) => api.post<ImportJobDetail>(`/imports/${id}/actions/cancel`, {}),
    meta: {
      invalidates: [importKeys.all, coreKeys.runningJobs],
      successToast: 'Import cancelled',
    },
  })
}

export const importDownloads = {
  original: (id: number) => api.get<DownloadLink>(`/imports/${id}/file`),
  errorReport: (id: number) => api.get<DownloadLink>(`/imports/${id}/error-report`),
  sample: (type: ImportType) => api.get<DownloadLink>(`/imports/templates/${type}/sample`),
  generate: (body: ImportGenerateSampleBody) =>
    api.post<DownloadLink>('/imports/generate-sample', body),
}

// ---- articles ---------------------------------------------------------------------------------

export interface ArticleListParams extends Query {
  q?: string
  category?: string[]
  active?: 'true' | 'false' | 'all'
  page?: number
  perPage?: number
  sort?: string
}

export const articleQueries = {
  list: (params: ArticleListParams) =>
    queryOptions({
      queryKey: articleKeys.list(params),
      queryFn: ({ signal }) => api.get<Page<Article>>('/articles', { query: params, signal }),
      placeholderData: keepPreviousData,
    }),
  detail: (id: number) =>
    queryOptions({
      queryKey: articleKeys.detail(id),
      queryFn: ({ signal }) => api.get<ArticleDetail>(`/articles/${id}`, { signal }),
    }),
}

export function useSaveArticle(id: number | null) {
  return useMutation({
    mutationFn: (body: ArticleInput) =>
      id === null
        ? api.post<ArticleDetail>('/articles', body)
        : api.patch<ArticleDetail>(`/articles/${id}`, body),
    meta: { invalidates: [articleKeys.all], errorToast: false },
  })
}

export function useArticleActive() {
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api.post<ArticleDetail>(`/articles/${id}/actions/${active ? 'activate' : 'deactivate'}`, {}),
    meta: { invalidates: [articleKeys.all] },
  })
}

export function useSaveSiteSetting(articleId: number) {
  return useMutation({
    mutationFn: ({ siteId, ...body }: ArticleSiteSettingPatch & { siteId: number }) =>
      api.patch<ArticleSiteSetting>(`/articles/${articleId}/site-settings/${siteId}`, body),
    meta: { invalidates: [articleKeys.all], errorToast: false },
  })
}

// ---- regions + rules ----------------------------------------------------------------------------

export const regionQueries = {
  detail: (id: number) =>
    queryOptions({
      queryKey: regionKeys.detail(id),
      queryFn: ({ signal }) => api.get<RegionDetail>(`/regions/${id}`, { signal }),
    }),
}

export function useSaveRegion(id: number) {
  return useMutation({
    mutationFn: (body: RegionPatch) => api.patch<RegionDetail>(`/regions/${id}`, body),
    meta: { invalidates: [regionKeys.all], errorToast: false, successToast: 'Region saved' },
  })
}

export function useSaveRule(id: number | null) {
  return useMutation({
    mutationFn: (body: RegionRuleInput) =>
      id === null
        ? api.post<RegionRule>('/region-rules', body)
        : api.patch<RegionRule>(`/region-rules/${id}`, body),
    meta: { invalidates: [regionKeys.all, ruleKeys.all], errorToast: false },
  })
}

export function useDeleteRule() {
  return useMutation({
    mutationFn: (id: number) => api.delete(`/region-rules/${id}`),
    meta: { invalidates: [regionKeys.all, ruleKeys.all], successToast: 'Rule deleted' },
  })
}

export function testRegionRules(body: RegionRuleTestBody): Promise<RegionResolutionResult> {
  return api.post<RegionResolutionResult>('/region-rules/test', body)
}

export function reapplyRegionRules(): Promise<JobAccepted> {
  return api.post<JobAccepted>('/region-rules/reapply', {})
}

// ---- VIP list -----------------------------------------------------------------------------------

export const vipQueries = {
  list: (q?: string) =>
    queryOptions({
      queryKey: vipKeys.list({ q: q ?? '' }),
      queryFn: ({ signal }) => api.get<List<VipEntry>>('/vip-entries', { query: { q }, signal }),
      placeholderData: keepPreviousData,
    }),
}

const VIP_EFFECTS = [vipKeys.all, srKeys.all, leaseKeys.all, contactKeys.all] as const

export function useSaveVip(id: number | null) {
  return useMutation({
    mutationFn: (body: VipEntryInput) => {
      if (id === null) return api.post<VipEntry>('/vip-entries', body)
      const { userId: _userId, ...patch } = body
      return api.patch<VipEntry>(`/vip-entries/${id}`, patch)
    },
    meta: { invalidates: VIP_EFFECTS, errorToast: false },
  })
}

export function useDeleteVip() {
  return useMutation({
    mutationFn: (id: number) => api.delete(`/vip-entries/${id}`),
    meta: { invalidates: VIP_EFFECTS, successToast: 'Removed from the VIP list' },
  })
}

// ---- users --------------------------------------------------------------------------------------

export interface UserListParams extends Query {
  q?: string
  role?: string[]
  active?: 'true' | 'false' | 'all'
}

export const userQueries = {
  list: (params: UserListParams) =>
    queryOptions({
      queryKey: userKeys.list(params),
      queryFn: ({ signal }) => api.get<List<UserSummary>>('/users', { query: params, signal }),
      placeholderData: keepPreviousData,
    }),
}

export function useCreateUser() {
  return useMutation({
    mutationFn: (body: UserCreate) => api.post<UserSummary>('/users', body),
    meta: { invalidates: [userKeys.all], errorToast: false },
  })
}

export function useUpdateUser(id: number) {
  return useMutation({
    mutationFn: (body: UserPatch) => api.patch<UserSummary>(`/users/${id}`, body),
    meta: { invalidates: [userKeys.all], errorToast: false },
  })
}

export function useUserActive() {
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api.post<UserSummary>(`/users/${id}/actions/${active ? 'activate' : 'deactivate'}`, {}),
    meta: { invalidates: [userKeys.all] },
  })
}

export function useResetPassword(id: number) {
  return useMutation({
    mutationFn: (newPassword: string) =>
      api.post<undefined>(`/users/${id}/actions/reset_password`, { newPassword }),
    meta: { errorToast: false, successToast: 'Password changed' },
  })
}
