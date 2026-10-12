import { http, HttpResponse, type RequestHandler } from 'msw'
import type { SeedDefinition } from './db'
import { apiPath, problems } from './http'

/**
 * Mock API registry: every module's `mocks/handlers.ts` (exporting `handlers`) and
 * `mocks/seed.ts` (exporting `seed`) is picked up automatically, no shared file to edit.
 */
const handlerModules = import.meta.glob<readonly RequestHandler[]>(
  '/src/modules/*/mocks/handlers.ts',
  { eager: true, import: 'handlers' },
)

const seedModules = import.meta.glob<SeedDefinition | undefined>('/src/modules/*/mocks/seed.ts', {
  eager: true,
  import: 'seed',
})

export const seeds: SeedDefinition[] = Object.values(seedModules).filter(
  (seed): seed is SeedDefinition => seed !== undefined,
)

/** Infrastructure endpoints that exist only in demo mode. */
const infrastructureHandlers: RequestHandler[] = [
  http.get(apiPath('/health'), () => HttpResponse.json({ status: 'ok', demo: true })),
]

/** Last resort: unknown API calls fail loudly instead of hitting the network. */
const fallbackHandlers: RequestHandler[] = [
  http.all(apiPath('/*'), ({ request }) =>
    problems.notImplemented(
      `${request.method} ${new URL(request.url).pathname} is not mocked in the demo.`,
    ),
  ),
]

const moduleHandlers: RequestHandler[] = Object.keys(handlerModules)
  .sort()
  .flatMap((path) => handlerModules[path] ?? [])

export const handlers: RequestHandler[] = [
  ...infrastructureHandlers,
  ...moduleHandlers,
  ...fallbackHandlers,
]
