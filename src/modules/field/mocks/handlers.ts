import type { RequestHandler } from 'msw'

/**
 * Mock endpoints of H4 Field service (API.md), collected by src/mocks/handlers.ts and placed
 * before the core handlers. Build them with `apiPath`, `authed`, `listResponse`, `problems.*`,
 * the core read models (`srListItem`, `srDetail`, …) and `applyAction` — see CONVENTIONS.md
 * "Mock API".
 */
export const handlers: RequestHandler[] = []
