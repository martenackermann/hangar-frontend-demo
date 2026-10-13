import { delay, HttpResponse } from 'msw'
import type { ProblemCode } from '@/lib/api/types'
import { env } from '@/lib/env'

/**
 * HTTP helpers for mock handlers. Everything the real API does on the wire lives here so slice
 * mocks answer exactly like API.md: problem+json errors (§1.4), `202 JobAccepted`, `204`.
 */

/** Full URL pattern for an API path, following VITE_API_URL: `http.get(apiPath('/sites'), …)`. */
export function apiPath(path: `/${string}`): string {
  return `${env.apiUrl}${path}`
}

/** Path relative to the API base (`/service-requests/42`), for `instance` and undo links. */
export function apiRelative(request: Request): string {
  const url = new URL(request.url)
  const base = new URL(env.apiUrl, url.origin).pathname.replace(/\/$/, '')
  return url.pathname.startsWith(base) ? url.pathname.slice(base.length) : url.pathname
}

/** Realistic latency in the browser (MSW "real" mode), near-zero in Node tests. */
export function demoLatency(): Promise<void> {
  return delay()
}

export interface ProblemOptions {
  detail?: string | null
  /** 422: camelCase field path → messages (`lines.2.quantity`). */
  errors?: Record<string, string[]>
  /** 409 guard_failed */
  guard?: { code: string; message: string }
  /** 409 transition_not_allowed */
  allowedActions?: string[]
  /** 409 version_conflict */
  currentVersion?: number
  request?: Request
}

const problemInfos = new WeakMap<Response, { code: string; title: string; detail: string | null }>()

/** Read back `code` / `title` / `detail` of a response made by `problem()` (bulk summaries). */
export function problemInfo(response: Response): {
  code: string
  title: string
  detail: string | null
} {
  return problemInfos.get(response) ?? { code: 'error', title: 'Failed', detail: null }
}

/** RFC 9457 problem+json exactly as API.md §1.4. */
export function problem(
  status: number,
  code: ProblemCode,
  title: string,
  options: ProblemOptions = {},
) {
  const response = HttpResponse.json(
    {
      type: `https://hangar.example.com/problems/${code}`,
      title,
      status,
      detail: options.detail ?? null,
      instance: options.request ? apiRelative(options.request) : '',
      code,
      ...(options.errors && { errors: options.errors }),
      ...(options.guard && { guard: options.guard }),
      ...(options.allowedActions && { allowedActions: options.allowedActions }),
      ...(options.currentVersion !== undefined && { currentVersion: options.currentVersion }),
    },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
  problemInfos.set(response, { code, title, detail: options.detail ?? null })
  return response
}

export const problems = {
  badRequest: (detail: string, request?: Request) =>
    problem(400, 'bad_request', 'Bad request', { detail, request }),
  unauthenticated: (request?: Request) =>
    problem(401, 'unauthenticated', 'Not signed in', { detail: 'Sign in to continue.', request }),
  invalidCredentials: (request?: Request) =>
    problem(401, 'invalid_credentials', 'Email or password is incorrect.', { request }),
  forbidden: (detail = 'You do not have permission to do this.', request?: Request) =>
    problem(403, 'forbidden', 'Not allowed', { detail, request }),
  notFound: (entity: string, id?: string | number, request?: Request) =>
    problem(404, 'not_found', 'Not found', {
      detail: id === undefined ? `${entity} not found.` : `${entity} ${id} not found.`,
      request,
    }),
  conflict: (detail: string, request?: Request) =>
    problem(409, 'conflict', 'Conflict', { detail, request }),
  duplicate: (detail: string, request?: Request) =>
    problem(409, 'duplicate', 'Already exists', { detail, request }),
  validation: (
    errors: Record<string, string[]>,
    detail = 'Some fields are invalid.',
    request?: Request,
  ) => problem(422, 'validation_error', 'Validation failed', { detail, errors, request }),
  /** Mock not built yet: fails loudly instead of hitting the network. */
  notImplemented: (detail: string, request?: Request) =>
    problem(501, 'unavailable', 'Not available in the demo yet', { detail, request }),
}

/** Parse a JSON request body; returns `{}` for an empty or malformed body. */
export async function readJson<T extends object>(request: Request): Promise<Partial<T>> {
  try {
    const text = await request.text()
    return text ? (JSON.parse(text) as Partial<T>) : {}
  } catch {
    return {}
  }
}

/** `204 No Content`. */
export function noContent() {
  return new HttpResponse(null, { status: 204 })
}

/** `{ data: T[] }` (API.md "List"). */
export function listOf<T>(data: readonly T[]) {
  return HttpResponse.json({ data })
}

/** ISO timestamp "now". */
export function nowIso(): string {
  return new Date().toISOString()
}

/** Integer path param or undefined. */
export function intParam(value: string | readonly string[] | undefined): number | undefined {
  const n = Number(Array.isArray(value) ? value[0] : value)
  return Number.isInteger(n) && n > 0 ? n : undefined
}
