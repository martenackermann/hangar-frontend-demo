import type { RequestHandler } from 'msw'

/**
 * Mock API handlers of the `imports` module (demo mode + Vitest). Collected automatically
 * by src/mocks/handlers.ts. Use apiPath(), listResponse(), problems.* and defineMachine()
 * from @/mocks/* so the mock behaves like the real API. Owner: slice H2 (Import & Master data).
 */
export const handlers: RequestHandler[] = []
