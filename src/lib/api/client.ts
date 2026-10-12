import createClient, { type Middleware } from 'openapi-fetch'
import { getAccessToken, signOut } from '@/lib/auth/store'
import { env } from '@/lib/env'
import { toApiError, toNetworkError } from './errors'
import type { paths } from './schema'

/**
 * Endpoints (OpenAPI schema paths) whose 401 means "wrong credentials", not "session
 * expired"; they must not trigger the global sign-out + redirect.
 * PLACEHOLDER (phase 2a): phase 2b aligns these with API.md.
 */
const SESSION_ENDPOINTS = new Set(['/auth/login', '/auth/token'])

type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | undefined

/** Registered once by the router (src/router.tsx): navigate to /login on 401. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | undefined): void {
  unauthorizedHandler = handler
}

const sessionMiddleware: Middleware = {
  onRequest({ request }) {
    const accessToken = getAccessToken()
    if (accessToken && !request.headers.has('Authorization')) {
      request.headers.set('Authorization', `Bearer ${accessToken}`)
    }
    return request
  },
  onResponse({ response, schemaPath }) {
    if (response.status === 401 && !SESSION_ENDPOINTS.has(schemaPath)) {
      signOut()
      unauthorizedHandler?.()
    }
    return undefined
  },
  onError({ error }) {
    // fetch() rejected (offline, CORS, DNS). Keep aborts as they are for TanStack Query.
    if (error instanceof DOMException && error.name === 'AbortError') return error
    return toNetworkError(error)
  },
}

/**
 * Typed API client for hangar-backend-demo, generated types in ./schema.d.ts.
 *
 *   const { data, error } = await api.GET('/service-requests/{id}', { params: { path: { id } } })
 *
 * In query functions prefer `unwrap(api.GET(...))`, which returns the data or throws an ApiError.
 */
export const api = createClient<paths>({
  baseUrl: env.apiUrl,
  // Resolve fetch lazily so MSW (tests) and other patches applied after import still apply.
  fetch: (request) => globalThis.fetch(request),
})

api.use(sessionMiddleware)

interface ApiResult {
  data?: unknown
  error?: unknown
  response: Response
}
type SuccessData<R extends ApiResult> = R extends { error?: never } ? R['data'] : never

/** Await an openapi-fetch call; return its data or throw a normalised `ApiError`. */
export async function unwrap<R extends ApiResult>(request: Promise<R>): Promise<SuccessData<R>> {
  let result: R
  try {
    result = await request
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw toNetworkError(error)
  }
  if (result.error !== undefined || !result.response.ok) {
    throw toApiError(result.error, result.response)
  }
  return result.data as SuccessData<R>
}
