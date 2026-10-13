import type { ServiceRequestRow } from '@/mocks/core/tables'
import { registerEffect } from '@/mocks/workflow'

/**
 * H3 rules for the shared transition maps (SPEC §4.1.1 #17–#25). The core mock already carries
 * the guards and effects of the H3 actions that only touch core tables (claim, release, finish,
 * skip, close, provide, ship); H3 adds what the backend slice does on top of them.
 */

// Reopening hands the request to the actor as a fresh claim (backend: editor + claimed_at).
registerEffect<ServiceRequestRow>('serviceRequest', 'reopen_personalization', ({ update, now }) =>
  update({ claimedAt: now }),
)
