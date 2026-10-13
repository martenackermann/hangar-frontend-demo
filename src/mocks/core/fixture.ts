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

/**
 * Fetch the fixture as a static asset (kept out of the JS bundle). A truncated body ("JSON at
 * position 2097135") or a dropped connection, both seen on a busy dev server, is retried once,
 * bypassing the HTTP cache.
 */
export async function loadFixture(): Promise<SeedFixture> {
  const { default: url } = await import('@/mocks/fixtures/seed.json?url')
  let fixture: SeedFixture
  try {
    fixture = await fetchFixture(url, 'default')
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof TypeError)) throw error
    await new Promise((resolve) => setTimeout(resolve, 250))
    fixture = await fetchFixture(url, 'reload')
  }
  setFixture(fixture)
  return fixture
}

async function fetchFixture(url: string, cache: RequestCache): Promise<SeedFixture> {
  const response = await fetch(url, { cache })
  if (!response.ok) throw new Error(`Could not load the demo dataset (${response.status}).`)
  return (await response.json()) as SeedFixture
}
