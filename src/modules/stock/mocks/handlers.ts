import type { RequestHandler } from 'msw'

/**
 * Mock API handlers of the `stock` module (demo mode + Vitest). Collected automatically
 * by src/mocks/handlers.ts. Use apiPath(), listResponse(), problems.* and defineMachine()
 * from @/mocks/* so the mock behaves like the real API. Owner: slice H5 (Stock/Inventory/Dashboard).
 */
export const handlers: RequestHandler[] = []
