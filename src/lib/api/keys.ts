import { createQueryKeys } from '@/lib/query/keys'

/**
 * Query keys of the shared workflow resources. Several slices read and change these
 * resources, so the keys live in core: invalidate `srKeys.all` after anything that changes a
 * service request (status, items, appointment), `leaseKeys.all` / `assetKeys.all` likewise.
 */
export const srKeys = createQueryKeys('service-requests')
export const leaseKeys = createQueryKeys('lease-returns')
export const assetKeys = createQueryKeys('assets')
export const contactKeys = createQueryKeys('contacts')
export const mailKeys = createQueryKeys('mail-log')

export type WorkflowResourceKey = 'serviceRequest' | 'leaseReturn' | 'asset'

/** API path segment per workflow resource (API.md §3.8). */
export const RESOURCE_PATHS: Record<WorkflowResourceKey, string> = {
  serviceRequest: '/service-requests',
  leaseReturn: '/lease-returns',
  asset: '/assets',
}

export const RESOURCE_KEYS = {
  serviceRequest: srKeys,
  leaseReturn: leaseKeys,
  asset: assetKeys,
} as const
