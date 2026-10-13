import { redirect, type ParsedLocation } from '@tanstack/react-router'
import type { Me } from '@/lib/api/types'
import type { Permission } from './permissions'
import { can, isAuthenticated } from './store'

/** Thrown by `requirePermission`; the shell renders the 403 page (SCREENS.md §2.2). */
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

/** Only allow same-origin relative redirect targets (no open redirects, no loops). */
export function safeRedirectTarget(target: string | undefined): string | undefined {
  if (!target?.startsWith('/') || target.startsWith('//') || target.startsWith('/login')) {
    return undefined
  }
  return target
}

/** Home per role (SCREENS.md §1.2): technicians land on My tour, everyone else on Pipeline. */
export function homePathFor(
  me: Pick<Me, 'role'> | null | undefined,
): '/field/my-tour' | '/pipeline' {
  return me?.role === 'technician' ? '/field/my-tour' : '/pipeline'
}

/** Redirects to /login (remembering the current location) when there is no valid session. */
export function requireAuth(location: ParsedLocation): void {
  if (isAuthenticated()) return
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect
  throw redirect({ to: '/login', search: { redirect: location.href } })
}

/**
 * Route guard for `beforeLoad` (the `_app` layout already requires a session):
 *
 *   export const Route = createFileRoute('/_app/service-requests')({
 *     beforeLoad: requirePermission('sr.read'),
 *   })
 *
 * Several keys = all required.
 */
export function requirePermission(...permissions: [Permission, ...Permission[]]) {
  return ({ location }: { location: ParsedLocation }): void => {
    requireAuth(location)
    if (!can(permissions)) throw new ForbiddenError(permissions)
  }
}

/** Guard for screens reachable with either permission (e.g. read-only variants). */
export function requireAnyPermission(...permissions: [Permission, ...Permission[]]) {
  return ({ location }: { location: ParsedLocation }): void => {
    requireAuth(location)
    if (!permissions.some((permission) => can(permission))) {
      throw new ForbiddenError(permissions)
    }
  }
}
