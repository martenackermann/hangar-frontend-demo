import type { PermissionKey } from '@/lib/enums/catalog'

/**
 * Permission keys of SPEC §3.2 (`sr.read`, `staging.personalize`, ...). The server is the
 * authority; the client uses `GET /me.permissions` to hide navigation, guard routes and hide
 * buttons. A typo in a key fails the type check.
 */
export type Permission = PermissionKey

export type PermissionRequirement = Permission | readonly Permission[]

/** True when `granted` contains every required permission. */
export function hasPermission(
  granted: readonly string[] | undefined,
  required: PermissionRequirement | undefined,
): boolean {
  if (required === undefined) return true
  if (!granted) return false
  const list: readonly Permission[] = typeof required === 'string' ? [required] : required
  return list.every((permission) => granted.includes(permission))
}

/** True when `granted` contains at least one of the permissions. */
export function hasAnyPermission(
  granted: readonly string[] | undefined,
  options: readonly Permission[],
): boolean {
  return options.some((permission) => granted?.includes(permission) ?? false)
}
