import type { SeedDefinition } from '@/mocks/db'

/**
 * Demo data of the `core` module. Declare its collections here:
 *
 *   declare module '@/mocks/db' {
 *     interface DemoCollections { exampleRecords: ExampleRecord }
 *   }
 *
 * Bump `version` whenever the data shape changes (forces a reseed in every browser).
 * Owner: phase 2b (foundation).
 */
export const seed: SeedDefinition = {
  module: 'core',
  version: 1,
  order: 0,
  run: () => {
    // Populated by phase 2b (foundation).
  },
}
