import { getResponse, http, type RequestHandler } from 'msw'
import { setupWorker } from 'msw/browser'
import seedMeta from 'virtual:hangar-seed-meta'
import { env } from '@/lib/env'
import { loadFixture, setFixtureHead, type FixtureHead } from './core/fixture'
import { db, loadSeedFaker } from './db'
import { handlers, seeds } from './handlers'
import { openIndexedDbStorage } from './idb-storage'

declare global {
  interface Window {
    /** Debug handle in demo mode: `__hangarDemo.db.collection('service_requests').all()`. */
    __hangarDemo?: { db: typeof db; reset: () => Promise<void> }
  }
}

/**
 * Demo mode bootstrap, awaited by src/main.tsx before the first render: open the in-browser
 * database (IndexedDB) and start MSW. Only the first visit, a new dataset or a new seed version
 * fetch `seed.json` and load faker to seed it; later visits restore the stored database.
 * Dev: MSW's own /mockServiceWorker.js. Builds: the PWA worker /sw.js imports the MSW worker
 * through public/msw-bridge.js (one service worker per scope).
 */
export async function startMockWorker(): Promise<void> {
  const started = performance.now()
  const apiPrefix = new URL(env.apiUrl, window.location.origin).href
  const worker = setupWorker(persistBeforeResponding(apiPrefix, handlers), ...handlers)
  // The worker does not need the database until the first request: start both at once.
  const workerReady = worker.start({
    serviceWorker: { url: import.meta.env.DEV ? '/mockServiceWorker.js' : '/sw.js' },
    quiet: !import.meta.env.DEV,
    onUnhandledRequest(request, print) {
      if (request.url.startsWith(apiPrefix)) print.warning()
    },
  })
  const seeded = await openDatabase()
  window.__hangarDemo = { db, reset: resetDemo }
  window.addEventListener('pagehide', () => db.flush())
  await workerReady
  const ms = Math.round(performance.now() - started)
  console.info(`[demo] Mock API ready in ${ms} ms${seeded ? ' (fresh demo data loaded)' : ''}.`)
}

/** Restore the stored database, or seed it from the fixture; true when seeded. */
async function openDatabase(): Promise<boolean> {
  try {
    localStorage.removeItem('hangar.demo-db.v2') // pre-IndexedDB versions
  } catch {
    // storage disabled
  }
  const storage = await openIndexedDbStorage()
  if (db.open({ fixtureMeta: seedMeta, seeds, storage })) {
    const head = db.fixtureHead
    if (head) setFixtureHead(head as unknown as FixtureHead)
    return false
  }
  const [fixture] = await Promise.all([loadFixture(), loadSeedFaker()])
  db.seed(fixture)
  return true
}

async function resetDemo(): Promise<void> {
  const [fixture] = await Promise.all([loadFixture(), loadSeedFaker()])
  db.reset({ fixture })
  await db.persist()
}

/**
 * Mutating API calls answer only after the demo database is written to IndexedDB, so reloading
 * (or closing the tab) right after a response never loses the change. Reads fall through to
 * the normal handlers untouched.
 */
function persistBeforeResponding(apiPrefix: string, all: RequestHandler[]): RequestHandler {
  return http.all(`${apiPrefix}/*`, async ({ request }) => {
    if (request.method === 'GET' || request.method === 'HEAD') return undefined
    const response = await getResponse(all, request)
    await db.persist()
    return response
  })
}
