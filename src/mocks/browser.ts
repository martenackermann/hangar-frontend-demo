import { createStore, get, set } from 'idb-keyval'
import { setupWorker } from 'msw/browser'
import { env } from '@/lib/env'
import { loadFixture } from './core/fixture'
import {
  db,
  DB_STORAGE_KEY,
  initDemoDb,
  resetDemoData,
  type DemoStorage,
  type PersistedDatabase,
} from './db'
import { handlers, seeds } from './handlers'

declare global {
  interface Window {
    /** Debug handle in demo mode: `__hangarDemo.db.collection('service_requests').all()`. */
    __hangarDemo?: { db: typeof db; reset: () => void }
  }
}

/**
 * Demo mode bootstrap, awaited by src/main.tsx before the first render: load the fixture, open
 * the in-browser database (persisted, dates shifted to today), start MSW.
 * Dev: MSW's own /mockServiceWorker.js. Builds: the PWA worker /sw.js imports the MSW worker
 * through public/msw-bridge.js (one service worker per scope).
 */
/** IndexedDB persistence (structured clone, no size issues); preloaded so `init` stays sync. */
async function openStorage(): Promise<DemoStorage | null> {
  try {
    localStorage.removeItem('hangar.demo-db.v2') // pre-IndexedDB versions
  } catch {
    // storage disabled
  }
  try {
    const store = createStore('hangar-demo', 'database')
    const persisted = await get<PersistedDatabase>(DB_STORAGE_KEY, store)
    return { read: () => persisted, write: (payload) => set(DB_STORAGE_KEY, payload, store) }
  } catch {
    return null // private mode / IndexedDB unavailable: in memory only
  }
}

export async function startMockWorker(): Promise<void> {
  const [fixture, storage] = await Promise.all([loadFixture(), openStorage()])
  const { seeded } = initDemoDb({ fixture, seeds, storage })
  window.__hangarDemo = { db, reset: resetDemoData }
  window.addEventListener('pagehide', () => db.flush())

  const apiPrefix = new URL(env.apiUrl, window.location.origin).href
  const worker = setupWorker(...handlers)
  await worker.start({
    serviceWorker: { url: import.meta.env.DEV ? '/mockServiceWorker.js' : '/sw.js' },
    quiet: !import.meta.env.DEV,
    onUnhandledRequest(request, print) {
      if (request.url.startsWith(apiPrefix)) print.warning()
    },
  })
  console.info(`[demo] Mock API ready${seeded ? ' (fresh demo data loaded)' : ''}.`)
}
