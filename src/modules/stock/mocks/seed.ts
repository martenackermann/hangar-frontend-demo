import type { SeedDefinition } from '@/mocks/db'

/**
 * Demo data of the `stock` module. Declare its collections here:
 *
 *   declare module '@/mocks/db' {
 *     interface DemoCollections { exampleRecords: ExampleRecord }
 *   }
 *
 * Bump `version` whenever the data shape changes (forces a reseed in every browser).
 * Owner: slice H5 (Stock/Inventory/Dashboard).
 */
export const seed: SeedDefinition = {
  module: 'stock',
  version: 1,
  order: 100,
  run: () => {
    // Populated by slice H5 (Stock/Inventory/Dashboard).
  },
}
