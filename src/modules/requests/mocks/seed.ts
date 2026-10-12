import type { SeedDefinition } from '@/mocks/db'

/**
 * Demo data of the `requests` module. Declare its collections here:
 *
 *   declare module '@/mocks/db' {
 *     interface DemoCollections { exampleRecords: ExampleRecord }
 *   }
 *
 * Bump `version` whenever the data shape changes (forces a reseed in every browser).
 * Owner: slice H1 (Requests & Comms).
 */
export const seed: SeedDefinition = {
  module: 'requests',
  version: 1,
  order: 100,
  run: () => {
    // Populated by slice H1 (Requests & Comms).
  },
}
