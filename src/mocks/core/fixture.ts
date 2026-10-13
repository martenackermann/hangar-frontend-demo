import type { EnumsResponse } from '@/lib/api/types'
import { ENUM_CATALOG } from '@/lib/enums/catalog'
import type { SeedFixture } from '@/mocks/fixtures/types'

/**
 * The loaded `seed.json` (SPEC_RESOLUTIONS #16). Browser: fetched next to the app
 * (`loadFixture()`); tests: read from disk by the Vitest setup.
 */
let current: SeedFixture | null = null

export function setFixture(fixture: SeedFixture): void {
  current = fixture
}

export function getFixture(): SeedFixture {
  if (!current) throw new Error('Demo fixture not loaded.')
  return current
}

/**
 * The `/meta/enums` payload the mock serves and the workflow engine runs on: the fixture's
 * `enums` (the backend's own when imported with `pnpm seed:import`), else the static catalog.
 */
export function servedEnums(): EnumsResponse {
  return current?.enums ?? ENUM_CATALOG
}

/** Fetch the fixture as a static asset (kept out of the JS bundle). */
export async function loadFixture(): Promise<SeedFixture> {
  const { default: url } = await import('@/mocks/fixtures/seed.json?url')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load the demo dataset (${response.status}).`)
  const fixture = (await response.json()) as SeedFixture
  setFixture(fixture)
  return fixture
}
