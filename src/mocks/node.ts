import { setupServer } from 'msw/node'
import { provideSeedFaker } from './db'
import { handlers } from './handlers'
import * as seedFaker from './seed-faker'

// The browser loads faker only to (re)seed; tests seed before every file, so load it up front.
provideSeedFaker(seedFaker)

/** MSW server for Vitest (started in src/test/setup.ts). Override per test with `server.use()`. */
export const server = setupServer(...handlers)
