import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { signOut } from '@/lib/auth/store'
import { initDemoDb, resetDemoData } from '@/mocks/db'
import { seeds } from '@/mocks/handlers'
import { server } from '@/mocks/node'

// Mock API for every test: same handlers + seeded demo database as demo mode, in memory.
beforeAll(() => {
  initDemoDb(seeds, { storage: null })
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
