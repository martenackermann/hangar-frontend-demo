import { redirect, type ParsedLocation } from '@tanstack/react-router'
import type { Permission } from './permissions'
import { can, isAuthenticated } from './store'

/** Routes reachable without a session. Everything else is guarded by the root route. */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/login'])

/** Thrown by `requirePermission`; the default route error component renders a 403 panel. */
export class ForbiddenError extends Error {
  readonly permissions: readonly Permission[]

  constructor(permissions: readonly Permission[]) {
    super(`Missing permission: ${permissions.join(', ')}`)
    this.name = 'ForbiddenError'
    this.permissions = permissions
  }
}

export function isForbiddenError(error: unknown): error is ForbiddenError {
  return error instanceof ForbiddenError
}

/** Only allow same-origin relative redirect targets (no open redirects). */
export function safeRedirectTarget(target: string | undefined): string {
  if (!target?.startsWith('/') || target.startsWith('//')) return '/'
  return target
}

/** Redirects to /login (remembering the current location) when there is no session. */
export function requireAuth(location: ParsedLocation): void {
  if (isAuthenticated()) return
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect
  throw redirect({ to: '/login', search: { redirect: location.href } })
}

/**
 * Route guard for `beforeLoad`:
 *
 *   export const Route = createFileRoute('/requests')({
 *     beforeLoad: requirePermission('requests:read'),
 *   })
 */
export function requirePermission(...permissions: [Permission, ...Permission[]]) {
  return ({ location }: { location: ParsedLocation }): void => {
    requireAuth(location)
    if (!can(permissions)) throw new ForbiddenError(permissions)
  }
}
