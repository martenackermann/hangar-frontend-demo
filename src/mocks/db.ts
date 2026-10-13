import { base, en, Faker } from '@faker-js/faker'
import { addDays, businessToday, daysBetween } from '@/lib/format'

/**
 * In-browser demo database for the MSW mock API.
 *
 * - Core tables are loaded from `src/mocks/fixtures/seed.json` (SPEC_RESOLUTIONS #16: raw table
 *   rows, camelCase), shifted to the viewer's today by whole weeks (#47) so weekdays survive.
 * - Typed collections: core tables are declared in `src/mocks/core/tables.ts`; slices declare
 *   their own tables by augmenting `DemoCollections` from their folder:
 *
 *     declare module '@/mocks/db' {
 *       interface DemoCollections { tours: TourRow }
 *     }
 *
 * - Slice seeds (`src/modules/<m>/mocks/seed.ts` → `seed: SeedDefinition`) run after the core
 *   tables are loaded, in `order`, each with its own deterministic faker.
 * - Persistence: everything is saved to localStorage under a versioned key; a changed fixture or
 *   seed `version` reseeds. "Reset demo data" reloads the fixture for today.
 */

export type Id = number

export interface BaseRecord {
  id: Id
}

/** Augmented by core (`src/mocks/core/tables.ts`) and by slices. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DemoCollections {}

export type CollectionName = Extract<keyof DemoCollections, string>

type RecordOf<K extends CollectionName> = DemoCollections[K] extends BaseRecord
  ? DemoCollections[K]
  : never

export type Patch<T> = Partial<Omit<T, 'id'>> | ((current: T) => T)

export class Collection<T extends BaseRecord> {
  readonly name: string
  readonly #rows: Map<number, T>
  readonly #onChange: () => void

  constructor(name: string, rows: readonly T[], onChange: () => void) {
    this.name = name
    this.#rows = new Map(rows.map((row) => [row.id, row]))
    this.#onChange = onChange
  }

  /** All rows in insertion order. Rows are immutable snapshots: never mutate them. */
  all(): T[] {
    return [...this.#rows.values()]
  }

  get(id: Id | string | undefined | null): T | undefined {
    if (id === undefined || id === null) return undefined
    return this.#rows.get(Number(id))
  }

  has(id: Id): boolean {
    return this.#rows.has(Number(id))
  }

  find(predicate: (row: T) => boolean): T | undefined {
    for (const row of this.#rows.values()) if (predicate(row)) return row
    return undefined
  }

  filter(predicate: (row: T) => boolean): T[] {
    return this.all().filter(predicate)
  }

  count(predicate?: (row: T) => boolean): number {
    return predicate ? this.filter(predicate).length : this.#rows.size
  }

  /** Next integer id (max id + 1). */
  nextId(): number {
    let max = 0
    for (const id of this.#rows.keys()) if (id > max) max = id
    return max + 1
  }

  /** Insert a row; `id` is assigned when omitted. */
  insert(row: Omit<T, 'id'> & { id?: Id }): T {
    const id = row.id ?? this.nextId()
    if (this.#rows.has(id)) throw new Error(`${this.name}: duplicate id ${id}`)
    const stored = { ...row, id } as T
    this.#rows.set(id, stored)
    this.#onChange()
    return stored
  }

  insertMany(rows: readonly T[]): T[] {
    for (const row of rows) {
      if (this.#rows.has(row.id)) throw new Error(`${this.name}: duplicate id ${row.id}`)
      this.#rows.set(row.id, row)
    }
    this.#onChange()
    return [...rows]
  }

  /** Merge or replace a row; returns the new row, or undefined when it does not exist. */
  update(id: Id, patch: Patch<T>): T | undefined {
    const current = this.#rows.get(Number(id))
    if (!current) return undefined
    const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch }
    const stored = { ...next, id: current.id }
    this.#rows.set(current.id, stored)
    this.#onChange()
    return stored
  }

  upsert(row: T): T {
    this.#rows.set(row.id, row)
    this.#onChange()
    return row
  }

  remove(id: Id): boolean {
    const removed = this.#rows.delete(Number(id))
    if (removed) this.#onChange()
    return removed
  }

  removeWhere(predicate: (row: T) => boolean): number {
    let removed = 0
    for (const [id, row] of this.#rows) {
      if (predicate(row)) {
        this.#rows.delete(id)
        removed++
      }
    }
    if (removed > 0) this.#onChange()
    return removed
  }

  clear(): void {
    this.#rows.clear()
    this.#onChange()
  }
}

// ---- fixture & seeds ---------------------------------------------------------------------

/** The parts of `seed.json` the loader needs (full type: src/mocks/fixtures/types.ts). */
export interface FixtureLike {
  meta: { version: number; generatedAt: string; anchorDate: string }
  tables: Record<string, readonly unknown[] | undefined>
}

export interface SeedContext {
  db: DemoDatabase
  /** Faker seeded from the module name: same data on every reseed. */
  faker: Faker
  /** Business date the data is shifted to (`YYYY-MM-DD`). */
  today: string
  /** The loaded fixture (slices may read their `tables.<name>` if the backend exported them). */
  fixture: FixtureLike
}

export interface SeedDefinition {
  /** Module folder name, e.g. `field`. */
  module: string
  /** Bump when the module's tables or seed logic change (forces a reseed everywhere). */
  version: number
  /** Lower runs first (default 100). Seeds can read core tables and earlier seeds' tables. */
  order?: number
  run(ctx: SeedContext): void
}

const DEMO_SEED = 20_261_013
export const DB_STORAGE_KEY = 'hangar.demo-db.v2'

function hashString(value: string): number {
  let hash = 2_166_136_261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

export function createSeedFaker(module: string, today: string): Faker {
  const faker = new Faker({ locale: [en, base] })
  faker.seed(DEMO_SEED + hashString(module))
  faker.setDefaultRefDate(new Date(`${today}T08:00:00Z`))
  return faker
}

function sortSeeds(seeds: readonly SeedDefinition[]): SeedDefinition[] {
  return [...seeds].sort(
    (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.module.localeCompare(b.module),
  )
}

function manifestOf(fixture: FixtureLike, seeds: readonly SeedDefinition[]): string {
  return [
    `fixture@${fixture.meta.version}:${fixture.meta.generatedAt}`,
    ...sortSeeds(seeds).map((seed) => `${seed.module}@${seed.version}`),
  ].join(',')
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/

/** Shift every ISO date / timestamp string in a JSON value by `days` (SPEC §11). */
export function shiftDates<T>(value: T, days: number): T {
  if (days === 0) return value
  const walk = (input: unknown): unknown => {
    if (typeof input === 'string') {
      if (DATE_ONLY.test(input)) return addDays(input, days)
      if (DATE_TIME.test(input))
        return new Date(Date.parse(input) + days * 86_400_000).toISOString()
      return input
    }
    if (Array.isArray(input)) return input.map(walk)
    if (input && typeof input === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, inner] of Object.entries(input)) out[key] = walk(inner)
      return out
    }
    return input
  }
  return walk(value) as T
}

/** Whole weeks between the fixture anchor and today (SPEC_RESOLUTIONS #47). */
export function weekShiftDays(anchorDate: string, today: string): number {
  return Math.round(daysBetween(anchorDate, today) / 7) * 7
}

// ---- database ----------------------------------------------------------------------------

type Snapshot = Record<string, BaseRecord[]>

interface PersistedDatabase {
  manifest: string
  today: string
  shiftDays: number
  savedAt: string
  tables: Snapshot
}

export interface InitOptions {
  fixture: FixtureLike
  seeds?: readonly SeedDefinition[]
  /** Where to persist; `null` keeps everything in memory (tests). Default: localStorage. */
  storage?: Storage | null
  /** Override "today" (tests). */
  today?: string
}

export class DemoDatabase {
  #collections = new Map<string, Collection<BaseRecord>>()
  #fixture: FixtureLike | null = null
  #seeds: SeedDefinition[] = []
  #storage: Storage | null = null
  #today = businessToday()
  #shiftDays = 0
  #saveTimer: ReturnType<typeof setTimeout> | undefined
  #persistFailed = false
  #seeded: { key: string; data: Snapshot } | undefined

  get initialized(): boolean {
    return this.#fixture !== null
  }

  /** Business date the data was shifted to. */
  get today(): string {
    return this.#today
  }

  /** Days the fixture dates were shifted by (multiple of 7). */
  get shiftDays(): number {
    return this.#shiftDays
  }

  collection<K extends CollectionName>(name: K): Collection<RecordOf<K>> {
    return this.table<RecordOf<K>>(name)
  }

  /** Untyped access for generic code (workflow engine, slices before declaring their types). */
  table<T extends BaseRecord>(name: string): Collection<T> {
    this.#assertInitialized()
    let collection = this.#collections.get(name)
    if (!collection) {
      collection = new Collection<BaseRecord>(name, [], () => this.#scheduleSave())
      this.#collections.set(name, collection)
    }
    return collection as unknown as Collection<T>
  }

  tableNames(): string[] {
    return [...this.#collections.keys()]
  }

  /** Load from storage when fixture + seed manifest match, otherwise (re)seed. */
  init({ fixture, seeds = [], storage, today }: InitOptions): { seeded: boolean } {
    this.#fixture = fixture
    this.#seeds = sortSeeds(seeds)
    this.#storage = storage === undefined ? (globalThis.localStorage ?? null) : storage
    this.#today = today ?? businessToday()

    const persisted = this.#readPersisted()
    if (persisted?.manifest === manifestOf(fixture, this.#seeds)) {
      this.#today = persisted.today
      this.#shiftDays = persisted.shiftDays
      this.#load(persisted.tables)
      return { seeded: false }
    }
    this.#reseed()
    return { seeded: true }
  }

  /** Throw away all changes and reload the fixture for today ("Reset demo data"). */
  reset(options: { today?: string } = {}): void {
    this.#assertInitialized()
    this.#today = options.today ?? businessToday()
    this.#reseed()
  }

  /** Persist pending changes immediately (normally debounced). */
  flush(): void {
    if (this.#saveTimer !== undefined) {
      clearTimeout(this.#saveTimer)
      this.#saveTimer = undefined
    }
    this.#save()
  }

  snapshot(): Snapshot {
    const data: Snapshot = {}
    for (const [name, collection] of this.#collections) data[name] = collection.all()
    return structuredClone(data)
  }

  #assertInitialized(): void {
    if (!this.#fixture)
      throw new Error('Demo database not initialised: call initDemoDb(...) first.')
  }

  #load(data: Snapshot): void {
    this.#collections.clear()
    for (const [name, rows] of Object.entries(data)) {
      this.#collections.set(
        name,
        new Collection<BaseRecord>(name, rows, () => this.#scheduleSave()),
      )
    }
  }

  #reseed(): void {
    const fixture = this.#fixture
    if (!fixture) return
    const cacheKey = `${manifestOf(fixture, this.#seeds)}|${this.#today}`
    if (this.#seeded?.key === cacheKey) {
      this.#load(structuredClone(this.#seeded.data))
    } else {
      this.#shiftDays = weekShiftDays(fixture.meta.anchorDate, this.#today)
      const tables: Snapshot = {}
      for (const [name, rows] of Object.entries(fixture.tables)) {
        tables[name] = shiftDates((rows ?? []) as BaseRecord[], this.#shiftDays)
      }
      this.#load(tables)
      for (const seed of this.#seeds) {
        seed.run({
          db: this,
          faker: createSeedFaker(seed.module, this.#today),
          today: this.#today,
          fixture,
        })
      }
      this.#seeded = { key: cacheKey, data: this.snapshot() }
    }
    this.flush()
  }

  #readPersisted(): PersistedDatabase | undefined {
    if (!this.#storage) return undefined
    try {
      const raw = this.#storage.getItem(DB_STORAGE_KEY)
      return raw ? (JSON.parse(raw) as PersistedDatabase) : undefined
    } catch {
      return undefined
    }
  }

  #scheduleSave(): void {
    if (!this.#storage || this.#saveTimer !== undefined) return
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = undefined
      this.#save()
    }, 150)
  }

  #save(): void {
    if (!this.#storage || this.#persistFailed || !this.#fixture) return
    const payload: PersistedDatabase = {
      manifest: manifestOf(this.#fixture, this.#seeds),
      today: this.#today,
      shiftDays: this.#shiftDays,
      savedAt: new Date().toISOString(),
      tables: this.snapshot(),
    }
    try {
      this.#storage.setItem(DB_STORAGE_KEY, JSON.stringify(payload))
    } catch (error) {
      // Quota exceeded or storage disabled: keep working in memory.
      this.#persistFailed = true
      console.warn('[demo] Could not persist demo data; changes are kept in memory only.', error)
    }
  }
}

/** The singleton used by all mock handlers. */
export const db = new DemoDatabase()

export function initDemoDb(options: InitOptions): { seeded: boolean } {
  return db.init(options)
}

/** Discard every change made in the demo and reload the fixture for today. */
export function resetDemoData(): void {
  db.reset()
}
