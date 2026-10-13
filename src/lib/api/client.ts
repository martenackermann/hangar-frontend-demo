import createClient, { type Middleware } from 'openapi-fetch'
import { getAccessToken, signOut } from '@/lib/auth/store'
import { env } from '@/lib/env'
import { toApiError, toNetworkError } from './errors'
import type { paths } from './schema'

/**
 * API client for hangar-backend-demo (API.md). Two flavours share the same behaviour
 * (bearer token, problem+json -> ApiError, 401 -> sign out + /login):
 *
 * - `api` — thin JSON client typed with the hand-written contract types in `./types.ts`
 *   (API.md is the source of truth; the backend's OpenAPI document is still partial):
 *
 *     const sr = await api.get<ServiceRequestDetail>(`/service-requests/${id}`, { signal })
 *     const page = await api.get<Page<ServiceRequestListItem>>('/service-requests', {
 *       query: { status: ['invited', 'escalated'], page: 2 },   // arrays -> comma lists
 *     })
 *     await api.post<ServiceRequestDetail>(`/service-requests/${id}/actions/claim`, {})
 *
 * - `typedApi` — openapi-fetch typed by the generated `schema.d.ts` (`pnpm api:types`), for
 *   endpoints that are in the backend's OpenAPI document.
 */

/** Endpoints whose 401 means "wrong credentials", not "session expired" (no global sign-out). */
const SESSION_PATHS = new Set(['/auth/login', '/auth/persona-login'])

type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | undefined

/** Registered once by the router (src/router.tsx): navigate to /login on 401. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | undefined): void {
  unauthorizedHandler = handler
}

function handleUnauthorized(path: string, status: number): void {
  if (status === 401 && !SESSION_PATHS.has(path) && getAccessToken()) {
    signOut()
    unauthorizedHandler?.()
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

// ---- JSON client -------------------------------------------------------------------------

export type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[]
export type Query = Record<string, QueryValue>

export interface RequestOptions {
  query?: Query | undefined
  signal?: AbortSignal | undefined
  headers?: Record<string, string> | undefined
}

/** `{ status: ['a','b'], page: 2, q: '' }` -> `?status=a,b&page=2` (API.md §1.3). */
export function toQueryString(query: Query | undefined): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','))
    } else {
      params.set(key, String(value))
    }
  }
  const text = params.toString().replace(/%2C/gi, ',')
  return text ? `?${text}` : ''
}

export function apiUrl(path: string, query?: Query): string {
  return `${env.apiUrl}${path}${toQueryString(query)}`
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers }
  const accessToken = getAccessToken()
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  let payload: BodyInit | undefined
  if (body instanceof FormData) {
    payload = body
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let response: Response
  try {
    response = await globalThis.fetch(apiUrl(path, options.query), {
      method,
      headers,
      body: payload,
      signal: options.signal ?? null,
    })
  } catch (error) {
    if (isAbort(error)) throw error
    throw toNetworkError(error)
  }

  if (!response.ok) {
    handleUnauthorized(path, response.status)
    throw toApiError(await readBody(response), response)
  }
  if (response.status === 204) return undefined as T
  return (await readBody(response)) as T
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body: unknown = {}, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  put: <T>(path: string, body: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),
  patch: <T>(path: string, body: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  delete: <T = void>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, undefined, options),
  /** multipart/form-data upload (API.md §1.6): file part `file`, extra fields as strings. */
  upload: <T>(path: string, form: FormData, options?: RequestOptions) =>
    request<T>('POST', path, form, options),
}

// ---- openapi-fetch client ----------------------------------------------------------------

const sessionMiddleware: Middleware = {
  onRequest({ request }) {
    const accessToken = getAccessToken()
    if (accessToken && !request.headers.has('Authorization')) {
      request.headers.set('Authorization', `Bearer ${accessToken}`)
    }
    return request
  },
  onResponse({ response, schemaPath }) {
    handleUnauthorized(schemaPath, response.status)
    return undefined
  },
  onError({ error }) {
    if (isAbort(error)) return error as Error
    return toNetworkError(error)
  },
}

export const typedApi = createClient<paths>({
  baseUrl: env.apiUrl,
  // Resolve fetch lazily so MSW (tests) and other patches applied after import still apply.
  fetch: (req) => globalThis.fetch(req),
})

typedApi.use(sessionMiddleware)

interface ApiResult {
  data?: unknown
  error?: unknown
  response: Response
}
type SuccessData<R extends ApiResult> = R extends { error?: never } ? R['data'] : never

/** Await a `typedApi` call; return its data or throw a normalised `ApiError`. */
export async function unwrap<R extends ApiResult>(call: Promise<R>): Promise<SuccessData<R>> {
  let result: R
  try {
    result = await call
  } catch (error) {
    if (isAbort(error)) throw error
    throw toNetworkError(error)
  }
  if (result.error !== undefined || !result.response.ok) {
    throw toApiError(result.error, result.response)
  }
  return result.data as SuccessData<R>
}
