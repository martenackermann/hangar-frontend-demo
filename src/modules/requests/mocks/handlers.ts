import type { RequestHandler } from 'msw'

/**
 * Mock endpoints of H1 Requests & Comms (API.md), collected by src/mocks/handlers.ts and placed
 * before the core handlers. Build them with `apiPath`, `authed`, `listResponse`, `problems.*`,
 * the core read models (`srListItem`, `srDetail`, …) and `applyAction` — see CONVENTIONS.md
 * "Mock API".
 */
export const handlers: RequestHandler[] = []
