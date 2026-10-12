import type { SeedDefinition } from '@/mocks/db'

/**
 * Demo data of the `field` module. Declare its collections here:
 *
 *   declare module '@/mocks/db' {
 *     interface DemoCollections { exampleRecords: ExampleRecord }
 *   }
 *
 * Bump `version` whenever the data shape changes (forces a reseed in every browser).
 * Owner: slice H4 (Field service).
 */
export const seed: SeedDefinition = {
  module: 'field',
  version: 1,
  order: 100,
  run: () => {
    // Populated by slice H4 (Field service).
  },
}
