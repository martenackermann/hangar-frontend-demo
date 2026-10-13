import { setupWorker } from 'msw/browser'
import { env } from '@/lib/env'
import { loadFixture } from './core/fixture'
import { db, initDemoDb, resetDemoData } from './db'
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
export async function startMockWorker(): Promise<void> {
  const fixture = await loadFixture()
  const { seeded } = initDemoDb({ fixture, seeds })
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
