/**
 * Query key factory, one per API resource (not per module):
 *
 *   export const serviceRequestKeys = createQueryKeys('service-requests')
 *   serviceRequestKeys.all                 -> ['service-requests']
 *   serviceRequestKeys.lists()             -> ['service-requests', 'list']
 *   serviceRequestKeys.list({ page: 2 })   -> ['service-requests', 'list', { page: 2 }]
 *   serviceRequestKeys.detail('42')        -> ['service-requests', 'detail', '42']
 *   serviceRequestKeys.scope('stats')      -> ['service-requests', 'stats']
 *
 * Invalidate with the broadest prefix that is correct: `serviceRequestKeys.all` after a
 * transition (lists + detail + stats change), `serviceRequestKeys.lists()` after a create.
 */
export function createQueryKeys<const TResource extends string>(resource: TResource) {
  return {
    all: [resource] as const,
    lists: () => [resource, 'list'] as const,
    list: <const TParams extends object>(params: TParams) => [resource, 'list', params] as const,
    details: () => [resource, 'detail'] as const,
    detail: (id: string | number) => [resource, 'detail', String(id)] as const,
    scope: <const TParts extends readonly unknown[]>(...parts: TParts) =>
      [resource, ...parts] as const,
  }
}
