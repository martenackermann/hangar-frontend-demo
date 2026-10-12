import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/** MSW server for Vitest (started in src/test/setup.ts). Override per test with `server.use()`. */
export const server = setupServer(...handlers)
