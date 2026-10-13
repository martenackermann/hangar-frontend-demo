import { http, type RequestHandler } from 'msw'
import './core/tables'
import './core/workflow'
import { coreHandlers } from './core/handlers'
import type { SeedDefinition } from './db'
import { apiPath, problems } from './http'

/**
 * Mock API registry (SPEC §2.3, SPEC_RESOLUTIONS #19). Slices contribute by file convention
 * under `src/modules/{requests,imports,staging,field,stock}/mocks/`:
 *
 *   workflow.ts   side effects: registerGuard / registerEffect / registerResolver / …
 *   handlers.ts   export const handlers: RequestHandler[]
 *   seed.ts       export const seed: SeedDefinition (slice tables derived from core rows)
 *
 * Handler order: slices → core → 501 fallback (first match wins, so a slice can override a
 * core endpoint, e.g. a richer GET /service-requests/{id}).
 */
import.meta.glob('/src/modules/{requests,imports,staging,field,stock}/mocks/workflow.ts', {
  eager: true,
})

const handlerModules = import.meta.glob<readonly RequestHandler[]>(
  '/src/modules/{requests,imports,staging,field,stock}/mocks/handlers.ts',
  { eager: true, import: 'handlers' },
)

const seedModules = import.meta.glob<SeedDefinition | undefined>(
  '/src/modules/{requests,imports,staging,field,stock}/mocks/seed.ts',
  { eager: true, import: 'seed' },
)

export const seeds: SeedDefinition[] = Object.keys(seedModules)
  .sort()
  .map((path) => seedModules[path])
  .filter((seed): seed is SeedDefinition => seed !== undefined)

const sliceHandlers: RequestHandler[] = Object.keys(handlerModules)
  .sort()
  .flatMap((path) => handlerModules[path] ?? [])

/** Last resort: unknown API calls fail loudly (501) instead of hitting the network. */
const fallbackHandlers: RequestHandler[] = [
  http.all(apiPath('/*'), ({ request }) =>
    problems.notImplemented(
      `${request.method} ${new URL(request.url).pathname} is not mocked in the demo yet.`,
      request,
    ),
  ),
]

export const handlers: RequestHandler[] = [...sliceHandlers, ...coreHandlers, ...fallbackHandlers]
