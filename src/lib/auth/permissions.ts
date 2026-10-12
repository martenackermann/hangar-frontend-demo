/**
 * Permission strings, `<resource>:<action>` (e.g. `requests:read`).
 *
 * PLACEHOLDER (phase 2a): phase 2b replaces this with the literal union from
 * _spec/hangar/API.md so typos fail the type check. The server is the authority;
 * the client only uses permissions to hide navigation and guard routes.
 */
export type Permission = `${string}:${string}`

/** Granted to the demo admin persona: matches every permission. */
export const ALL_PERMISSIONS = '*'

export type PermissionRequirement = Permission | readonly Permission[]

/** True when `granted` contains every required permission (or the `*` wildcard). */
export function hasPermission(
  granted: readonly string[] | undefined,
  required: PermissionRequirement | undefined,
): boolean {
  if (required === undefined) return true
  if (!granted) return false
  if (granted.includes(ALL_PERMISSIONS)) return true
  const list: readonly Permission[] = typeof required === 'string' ? [required] : required
  return list.every((permission) => granted.includes(permission))
}
