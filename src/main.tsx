import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/atkinson-hyperlegible-mono'
import { StrictMode } from 'react'
import { createRoot, type RootOptions } from 'react-dom/client'
import { ForbiddenError } from '@/lib/auth/guards'
import { installShortcuts } from '@/lib/shortcuts'
import { applyPrefsToDocument, prefsStore } from '@/lib/prefs/store'
import { App } from './app'
import './styles/app.css'

/** Demo mode: start the mock API (MSW + in-browser database) before the first request. */
async function startDemoMode(): Promise<void> {
  // Inline env check (not env.demoMode) so non-demo builds drop the mocks chunk entirely.
  if (import.meta.env.VITE_DEMO_MODE !== 'true') return
  const { startMockWorker } = await import('./mocks/browser')
  await startMockWorker()
}

/**
 * A 403 is control flow (requirePermission throws, the route's error component renders the
 * Forbidden page), not a bug: keep it out of the console. Everything else is logged as React would.
 */
const onCaughtError: RootOptions['onCaughtError'] = (error, info) => {
  if (error instanceof ForbiddenError) return
  console.error(error, info.componentStack)
}

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

applyPrefsToDocument(prefsStore.get())
installShortcuts()

void startDemoMode()
  .catch((error: unknown) => {
    console.error('[demo] Mock API failed to start; API calls will fail.', error)
  })
  .finally(() => {
    createRoot(container, { onCaughtError }).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
