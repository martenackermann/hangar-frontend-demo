import type { RequestHandler } from 'msw'

/**
 * Mock API handlers of the `requests` module (demo mode + Vitest). Collected automatically
 * by src/mocks/handlers.ts. Use apiPath(), listResponse(), problems.* and defineMachine()
 * from @/mocks/* so the mock behaves like the real API. Owner: slice H1 (Requests & Comms).
 */
export const handlers: RequestHandler[] = []
