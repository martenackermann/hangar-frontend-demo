import type { SeedDefinition } from '@/mocks/db'

/**
 * Demo data of the `imports` module. Declare its collections here:
 *
 *   declare module '@/mocks/db' {
 *     interface DemoCollections { exampleRecords: ExampleRecord }
 *   }
 *
 * Bump `version` whenever the data shape changes (forces a reseed in every browser).
 * Owner: slice H2 (Import & Master data).
 */
export const seed: SeedDefinition = {
  module: 'imports',
  version: 1,
  order: 100,
  run: () => {
    // Populated by slice H2 (Import & Master data).
  },
}
