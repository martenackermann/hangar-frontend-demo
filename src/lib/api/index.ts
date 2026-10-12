export { api, setUnauthorizedHandler, unwrap } from './client'
export {
  ApiError,
  ROOT_ERROR_KEY,
  isApiError,
  toApiError,
  toNetworkError,
  type FieldErrors,
} from './errors'
export type { components, paths } from './schema'

import type { components } from './schema'

/** Shorthand for a generated schema type: `Schema<'ServiceRequest'>`. */
export type Schema<K extends keyof components['schemas']> = components['schemas'][K]
