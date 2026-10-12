import { setupWorker } from 'msw/browser'
import { env } from '@/lib/env'
import { db, initDemoDb, resetDemoData } from './db'
import { handlers, seeds } from './handlers'

declare global {
  interface Window {
    /** Debug handle in demo mode: `__hangarDemo.db.collection('...').all()` in the console. */
    __hangarDemo?: { db: typeof db; reset: () => void }
  }
}

/**
 * Demo mode bootstrap, awaited by src/main.tsx before the first render.
 * Dev: MSW's own /mockServiceWorker.js. Builds: the PWA worker /sw.js, which imports the
 * MSW worker through public/msw-bridge.js (one service worker per scope).
 */
export async function startMockWorker(): Promise<void> {
  const { seeded } = initDemoDb(seeds)
  window.__hangarDemo = { db, reset: resetDemoData }
  window.addEventListener('pagehide', () => db.flush())

  const apiPrefix = new URL(env.apiUrl, window.location.origin).href
  const worker = setupWorker(...handlers)
  await worker.start({
    serviceWorker: { url: import.meta.env.DEV ? '/mockServiceWorker.js' : '/sw.js' },
    quiet: !import.meta.env.DEV,
    onUnhandledRequest(request, print) {
      // Assets, fonts, HMR: not our business. Unhandled API calls are a bug in the mocks.
      if (request.url.startsWith(apiPrefix)) print.warning()
    },
  })
  console.info(`[demo] Mock API ready${seeded ? ' (fresh demo data seeded)' : ''}.`)
}
