/// <reference types="node" />
import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { signOut } from '@/lib/auth/store'
import { installShortcuts } from '@/lib/shortcuts'
import { setFixture } from '@/mocks/core/fixture'
import { initDemoDb, resetDemoData } from '@/mocks/db'
import type { SeedFixture } from '@/mocks/fixtures/types'
import { seeds } from '@/mocks/handlers'
import { server } from '@/mocks/node'

/**
 * Every test runs against the same mock API as demo mode: all handlers + the demo database
 * loaded from seed.json (in memory, reset before each test). Override endpoints per test with
 * `server.use(...)`; unhandled requests fail the test.
 */
// jsdom lacks matchMedia; the shell and the table read it for breakpoints/reduced motion.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: query.includes('min-width') && !query.includes('pointer'),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  })
}

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/mocks/fixtures/seed.json'), 'utf8'),
) as SeedFixture

beforeAll(() => {
  installShortcuts()
  setFixture(fixture)
  initDemoDb({ fixture, seeds, storage: null })
  server.listen({ onUnhandledRequest: 'error' })
})

beforeEach(() => {
  resetDemoData()
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  signOut()
  localStorage.clear()
})

afterAll(() => {
  server.close()
})
