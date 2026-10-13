import type { RequestHandler } from 'msw'
import { importHandlers } from './import-handlers'
import { masterHandlers } from './master-handlers'
import './tables'
import { userHandlers } from './user-handlers'

/**
 * Mock endpoints of H2 Import & Master data (API.md §5), placed before the core handlers:
 * imports (a port of the backend import engine in `./engine`, run inside a mock background
 * job), articles, regions + rules, the VIP list and user administration.
 */
export const handlers: RequestHandler[] = [...importHandlers, ...masterHandlers, ...userHandlers]
