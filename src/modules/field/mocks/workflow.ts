/**
 * H4 rules for the shared transition maps (SPEC §4, SPEC_RESOLUTIONS #3): register guards,
 * validators, resolvers, effects and authorizers for the actions this slice owns, e.g.
 *
 *   import { registerGuard } from '@/mocks/workflow'
 *   registerGuard('serviceRequest', 'book_appointment', ({ payload }) => …)
 *
 * Loaded once (side effects) before the handlers.
 */
export {}
