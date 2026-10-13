import type { EnumsResponse } from '@/lib/api/types'
import { ENUM_CATALOG } from '@/lib/enums/catalog'
import type { SeedFixture } from '@/mocks/fixtures/types'

/**
 * The demo dataset `seed.json` (SPEC_RESOLUTIONS #16). Browser: fetched lazily, only when the
 * database must be (re)seeded (`loadFixture()`); a restored database brings the fixture's head
 * (meta, enums, config) along (`setFixtureHead`). Tests: read from disk by the Vitest setup.
 */
export type FixtureHead = Omit<SeedFixture, 'tables'>

let head: FixtureHead | null = null
let full: SeedFixture | null = null
let loading: Promise<SeedFixture> | null = null

export function setFixture(fixture: SeedFixture): void {
  full = fixture
  const { tables: _tables, ...rest } = fixture
  void _tables
  head = rest
}

/** The fixture's meta, enums and config, restored with the demo database. */
export function setFixtureHead(value: FixtureHead): void {
  head = value
}

export function fixtureHead(): FixtureHead {
  if (!head) throw new Error('Demo fixture not loaded.')
  return head
}

/**
 * The `/meta/enums` payload the mock serves and the workflow engine runs on: the fixture's
 * `enums` (the backend's own when imported with `pnpm seed:import`), else the static catalog.
 */
export function servedEnums(): EnumsResponse {
  return head?.enums ?? ENUM_CATALOG
}

/**
 * The cache the PWA worker serves the fixture from (`vite.config.ts` → `runtimeCaching`): the
 * fixture is not precached (~5 MB, only needed to seed), but once loaded it stays available
 * offline for "Reset demo data".
 */
const FIXTURE_CACHE = 'hangar-seed'

/**
 * The whole fixture, fetched once as a static asset (kept out of the JS bundle). A truncated
 * body ("JSON at position 2097135") or a dropped connection, both seen on a busy dev server, is
 * retried once, bypassing the HTTP cache.
 */
export function loadFixture(): Promise<SeedFixture> {
  if (full) return Promise.resolve(full)
  loading ??= fetchWithRetry().then(
    (fixture) => {
      setFixture(fixture)
      return fixture
    },
    (error: unknown) => {
      loading = null
      throw error
    },
  )
  return loading
}

async function fetchWithRetry(): Promise<SeedFixture> {
  const { default: url } = await import('@/mocks/fixtures/seed.json?url')
  try {
    return await fetchFixture(url, 'default')
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof TypeError)) throw error
    await new Promise((resolve) => setTimeout(resolve, 250))
    return fetchFixture(url, 'reload')
  }
}

async function fetchFixture(url: string, cache: RequestCache): Promise<SeedFixture> {
  const response = await fetch(url, { cache })
  if (!response.ok) throw new Error(`Could not load the demo dataset (${response.status}).`)
  const copy = import.meta.env.PROD ? response.clone() : null
  const fixture = (await response.json()) as SeedFixture
  if (copy) void keepForOffline(url, copy)
  return fixture
}

/**
 * On the first visit the fixture is fetched before the PWA worker controls the page, so the
 * worker never sees it: store it in the worker's runtime cache ourselves (unless the worker
 * already did). Drops the fixtures of older builds from that cache.
 */
async function keepForOffline(url: string, response: Response): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    const cache = await caches.open(FIXTURE_CACHE)
    const href = new URL(url, window.location.href).href
    for (const request of await cache.keys()) if (request.url !== href) await cache.delete(request)
    if (!(await cache.match(href))) await cache.put(href, response)
  } catch {
    // Cache Storage unavailable (private mode): the fixture is fetched again when needed.
  }
}
