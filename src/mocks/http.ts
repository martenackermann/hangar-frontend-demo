import { delay, HttpResponse } from 'msw'
import type { FieldErrors } from '@/lib/api/errors'
import { env } from '@/lib/env'

/**
 * Full URL pattern for an API path, so handlers follow VITE_API_URL:
 *   http.get(apiPath('/service-requests/:id'), ...)
 */
export function apiPath(path: `/${string}`): string {
  return `${env.apiUrl}${path}`
}

/** Realistic latency in the browser (MSW "real" mode), near-zero in Node tests. */
export function demoLatency(): Promise<void> {
  return delay()
}

export interface ProblemOptions {
  detail?: string
  /** URI identifying the problem type (RFC 9457). Default `about:blank`. */
  type?: string
  fieldErrors?: FieldErrors
  /** Extra members merged into the problem document. */
  extensions?: Record<string, unknown>
}

/**
 * RFC 9457 problem+json response.
 * PLACEHOLDER (phase 2a): the `errors` member shape is aligned with API.md in phase 2b;
 * the client-side normaliser (src/lib/api/errors.ts) accepts all common shapes anyway.
 */
export function problem(status: number, title: string, options: ProblemOptions = {}) {
  const errors = options.fieldErrors
    ? Object.entries(options.fieldErrors).flatMap(([field, messages]) =>
        messages.map((message) => ({ field, message })),
      )
    : undefined
  return HttpResponse.json(
    {
      type: options.type ?? 'about:blank',
      title,
      status,
      ...(options.detail !== undefined && { detail: options.detail }),
      ...(errors && { errors }),
      ...options.extensions,
    },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

export const problems = {
  badRequest: (detail?: string) => problem(400, 'Bad request', { detail }),
  unauthorized: () => problem(401, 'Not signed in', { detail: 'Sign in to continue.' }),
  forbidden: (detail = 'You do not have permission to do this.') =>
    problem(403, 'Not allowed', { detail }),
  notFound: (entity: string, id?: string | number) =>
    problem(404, 'Not found', {
      detail: id === undefined ? `${entity} not found.` : `${entity} ${id} not found.`,
    }),
  conflict: (detail: string) => problem(409, 'Conflict', { detail }),
  validation: (fieldErrors: FieldErrors, detail = 'Some fields are invalid.') =>
    problem(422, 'Validation failed', { detail, fieldErrors }),
  notImplemented: (detail = 'This endpoint is not available in the demo yet.') =>
    problem(501, 'Not implemented', { detail }),
}

/** Parse a JSON request body; returns undefined for an empty or malformed body. */
export async function readJson<T>(request: Request): Promise<T | undefined> {
  try {
    return (await request.json()) as T
  } catch {
    return undefined
  }
}

/** ISO timestamp "now" for createdAt/updatedAt fields. */
export function nowIso(): string {
  return new Date().toISOString()
}
