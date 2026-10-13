/** `{ to, search }` for components that take TanStack link props (StatTile) into other slices. */
export function screenTarget(to: string, search?: Record<string, unknown>) {
  return { to: to as never, search: search as never }
}
