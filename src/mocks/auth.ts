import type { HttpResponseResolver, PathParams } from 'msw'
import type { Role } from '@/lib/api/types'
import { ROLE_PERMISSIONS, type PermissionKey } from '@/lib/enums/catalog'
import { db } from './db'
import { problems } from './http'

/**
 * Mock authentication: demo access tokens are opaque `demo.<userId>.<nonce>` strings (the real
 * API issues JWTs). Permissions come from the role matrix (SPEC §3.2).
 */
export interface MockActor {
  id: number
  email: string
  firstName: string
  lastName: string
  displayName: string
  role: Role
  homeSiteId: number | null
  permissions: readonly PermissionKey[]
}

interface UserRowLike {
  id: number
  email: string
  firstName: string
  lastName: string
  role: Role
  homeSiteId: number | null
  isActive: boolean
}

export const TOKEN_TTL_MS = 12 * 3_600_000

export function issueToken(userId: number): string {
  return `demo.${userId}.${Math.random().toString(36).slice(2, 10)}`
}

export function actorForUser(user: UserRowLike): MockActor {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: `${user.firstName} ${user.lastName}`,
    role: user.role,
    homeSiteId: user.homeSiteId,
    permissions: ROLE_PERMISSIONS[user.role],
  }
}

/** The signed-in user of a request, or null (missing/invalid token, inactive user). */
export function actorFromRequest(request: Request): MockActor | null {
  const header = request.headers.get('Authorization') ?? ''
  const match = /^Bearer demo\.(\d+)\./.exec(header)
  if (!match) return null
  const user = db.table<UserRowLike & { id: number }>('users').get(Number(match[1]))
  return user?.isActive ? actorForUser(user) : null
}

type ResolverInfo<P extends PathParams> = Parameters<HttpResponseResolver<P>>[0]

/**
 * Wrap a resolver with authentication (401) and an optional permission check (403):
 *
 *   http.get(apiPath('/sites'), authed(null, () => listOf(sites())))
 *   http.post(apiPath('/stock/recalculate'), authed('stock.recalculate', ({ actor }) => …))
 */
export function authed<P extends PathParams = PathParams>(
  permission: PermissionKey | readonly PermissionKey[] | null,
  resolver: (info: ResolverInfo<P> & { actor: MockActor }) => Response | Promise<Response>,
): HttpResponseResolver<P> {
  return (info) => {
    const actor = actorFromRequest(info.request)
    if (!actor) return problems.unauthenticated(info.request)
    const required =
      permission === null ? [] : typeof permission === 'string' ? [permission] : permission
    if (!required.every((key) => actor.permissions.includes(key))) {
      return problems.forbidden(
        `Your role (${actor.role}) does not include ${required.join(', ')}.`,
        info.request,
      )
    }
    return resolver({ ...info, actor })
  }
}
