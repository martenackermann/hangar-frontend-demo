/**
 * Normalised API error. Every failed API call surfaces as an `ApiError`, whatever the
 * server sent: RFC 9457 problem+json as specified in API.md §1.4 (`code`, `errors`, `guard`,
 * `allowedActions`, `currentVersion`), FastAPI's default `{ detail }` shapes, plain text, or
 * nothing at all (network failure, status 0).
 *
 * `fieldErrors` keys are dot paths matching react-hook-form field names
 * (`lines.2.quantity`). Errors that belong to no field use the key `root`.
 */
export type FieldErrors = Record<string, string[]>

export const ROOT_ERROR_KEY = 'root'

export interface ApiErrorInit {
  status: number
  title: string
  detail?: string | undefined
  type?: string | undefined
  /** Machine code (API.md §1.4), e.g. `guard_failed`, `version_conflict`. */
  code?: string | undefined
  fieldErrors?: FieldErrors | undefined
  /** 409 guard_failed: which guard and its message. */
  guard?: { code: string; message: string } | undefined
  /** 409 transition_not_allowed: actions available from the current status. */
  allowedActions?: string[] | undefined
  /** 409 version_conflict. */
  currentVersion?: number | undefined
  body?: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly title: string
  readonly detail: string | undefined
  readonly type: string | undefined
  readonly code: string | undefined
  readonly fieldErrors: FieldErrors
  readonly guard: { code: string; message: string } | undefined
  readonly allowedActions: string[] | undefined
  readonly currentVersion: number | undefined
  /** The raw parsed response body, for debugging. */
  readonly body: unknown

  constructor(init: ApiErrorInit) {
    super(init.detail ? `${init.title}: ${init.detail}` : init.title)
    this.name = 'ApiError'
    this.status = init.status
    this.title = init.title
    this.detail = init.detail
    this.type = init.type
    this.code = init.code
    this.fieldErrors = init.fieldErrors ?? {}
    this.guard = init.guard
    this.allowedActions = init.allowedActions
    this.currentVersion = init.currentVersion
    this.body = init.body
  }

  /** 409 version_conflict: show "This record changed. Reload" (SCREENS.md §0). */
  get isVersionConflict(): boolean {
    return this.code === 'version_conflict'
  }

  get isNetworkError(): boolean {
    return this.status === 0
  }

  get isValidationError(): boolean {
    return this.status === 400 || this.status === 422
  }

  get hasFieldErrors(): boolean {
    return Object.keys(this.fieldErrors).length > 0
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

const STATUS_TITLES: Record<number, string> = {
  0: 'Network error',
  400: 'Bad request',
  401: 'Not signed in',
  403: 'Not allowed',
  404: 'Not found',
  409: 'Conflict',
  412: 'Precondition failed',
  413: 'Payload too large',
  422: 'Validation failed',
  429: 'Too many requests',
  500: 'Server error',
  501: 'Not implemented',
  502: 'Bad gateway',
  503: 'Service unavailable',
  504: 'Gateway timeout',
}

export function defaultTitleForStatus(status: number): string {
  return STATUS_TITLES[status] ?? (status >= 500 ? 'Server error' : 'Request failed')
}

const LOCATION_PREFIXES = new Set(['body', 'query', 'path', 'header', 'cookie'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** `['body', 'items', 0, 'serial']` | `/items/0/serial` | `items[0].serial` -> `items.0.serial` */
export function toFieldPath(raw: unknown): string {
  let parts: string[]
  if (Array.isArray(raw)) {
    parts = raw.map(String)
    if (LOCATION_PREFIXES.has(parts[0] ?? '')) parts = parts.slice(1)
  } else if (typeof raw === 'string') {
    const cleaned = raw.replace(/^#/, '')
    parts = cleaned.startsWith('/')
      ? cleaned
          .slice(1)
          .split('/')
          .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
      : cleaned.replace(/\[(\w+)\]/g, '.$1').split('.')
  } else {
    parts = []
  }
  const path = parts.filter((part) => part !== '').join('.')
  return path === '' ? ROOT_ERROR_KEY : path
}

function addFieldError(target: FieldErrors, path: string, message: string): void {
  ;(target[path] ??= []).push(message)
}

/** Accepts the common shapes of per-field error lists. */
function collectFieldErrors(source: unknown, target: FieldErrors): void {
  if (Array.isArray(source)) {
    for (const item of source) {
      if (typeof item === 'string') {
        addFieldError(target, ROOT_ERROR_KEY, item)
        continue
      }
      if (!isRecord(item)) continue
      const message =
        asString(item.message) ??
        asString(item.msg) ??
        asString(item.detail) ??
        asString(item.reason) ??
        'Invalid value'
      const location = item.field ?? item.loc ?? item.pointer ?? item.path ?? item.name
      addFieldError(target, toFieldPath(location), message)
    }
    return
  }
  if (isRecord(source)) {
    for (const [field, value] of Object.entries(source)) {
      const messages = Array.isArray(value) ? value : [value]
      for (const message of messages) {
        const text = asString(message)
        if (text) addFieldError(target, toFieldPath(field), text)
      }
    }
  }
}

/**
 * Build an `ApiError` from a parsed response body (openapi-fetch hands us the JSON, or the
 * text when the body is not JSON) and the response status.
 */
export function toApiError(
  body: unknown,
  response?: Pick<Response, 'status' | 'statusText'>,
): ApiError {
  if (body instanceof ApiError) return body

  const bodyStatus = isRecord(body) && typeof body.status === 'number' ? body.status : undefined
  const status = response?.status ?? bodyStatus ?? 0
  const fallbackTitle = asString(response?.statusText) ?? defaultTitleForStatus(status)

  if (isRecord(body)) {
    const fieldErrors: FieldErrors = {}
    collectFieldErrors(body.errors, fieldErrors)
    collectFieldErrors(
      body['invalid-params'] ?? body.invalidParams ?? body.invalid_params,
      fieldErrors,
    )
    // FastAPI default validation error: { detail: [{ loc, msg, type }] }
    if (Array.isArray(body.detail)) collectFieldErrors(body.detail, fieldErrors)

    const guard =
      isRecord(body.guard) && typeof body.guard.code === 'string'
        ? { code: body.guard.code, message: asString(body.guard.message) ?? body.guard.code }
        : undefined
    return new ApiError({
      status,
      title: asString(body.title) ?? fallbackTitle,
      detail: asString(body.detail) ?? asString(body.message) ?? guard?.message,
      type: asString(body.type),
      code: asString(body.code),
      fieldErrors,
      guard,
      allowedActions: Array.isArray(body.allowedActions)
        ? body.allowedActions.filter((a): a is string => typeof a === 'string')
        : undefined,
      currentVersion: typeof body.currentVersion === 'number' ? body.currentVersion : undefined,
      body,
    })
  }

  const text = asString(body)
  const looksLikeHtml = text?.trimStart().startsWith('<') ?? false
  return new ApiError({
    status,
    title: fallbackTitle,
    detail: text && !looksLikeHtml && text.length <= 500 ? text : undefined,
    body,
  })
}

/** Wrap anything thrown while talking to the API (fetch rejection, abort, bug). */
export function toNetworkError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  const detail = error instanceof Error ? error.message : undefined
  return new ApiError({ status: 0, title: defaultTitleForStatus(0), detail, body: error })
}
