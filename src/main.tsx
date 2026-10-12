import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import './styles/app.css'

/** Demo mode: start the mock API (MSW + in-browser database) before the first request. */
async function startDemoMode(): Promise<void> {
  // Inline env check (not env.demoMode) so non-demo builds drop the mocks chunk entirely.
  if (import.meta.env.VITE_DEMO_MODE !== 'true') return
  const { startMockWorker } = await import('./mocks/browser')
  await startMockWorker()
}

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

void startDemoMode()
  .catch((error: unknown) => {
    console.error('[demo] Mock API failed to start; API calls will fail.', error)
  })
  .finally(() => {
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
