import { base, en, Faker } from '@faker-js/faker'

/**
 * In-browser demo database for the MSW mock API.
 *
 * - Typed collections: each module declares its collections by augmenting
 *   `DemoCollections` from its own folder (no shared file to edit):
 *
 *     // src/modules/requests/mocks/seed.ts
 *     declare module '@/mocks/db' {
 *       interface DemoCollections { serviceRequests: ServiceRequestRecord }
 *     }
 *
 * - Seeds: each module exports `seed: SeedDefinition` from `mocks/seed.ts`; seeds run in
 *   `order`, each with its own deterministically seeded faker instance.
 * - Persistence: the whole database is saved to localStorage under a versioned key. Bump
 *   your module seed's `version` when its data shape changes: a changed version manifest
 *   triggers a reseed on next load.
 */

export type Id = string | number

export interface BaseRecord {
  id: Id
}

/** Augmented by modules (see above). */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DemoCollections {}

export type CollectionName = Extract<keyof DemoCollections, string>

type RecordOf<K extends CollectionName> = DemoCollections[K] extends BaseRecord
  ? DemoCollections[K]
  : never

export type Patch<T> = Partial<Omit<T, 'id'>> | ((current: T) => T)

export class Collection<T extends BaseRecord> {
  readonly name: string
  readonly #rows: Map<string, T>
  readonly #onChange: () => void

  constructor(name: string, rows: readonly T[], onChange: () => void) {
    this.name = name
    this.#rows = new Map(rows.map((row) => [String(row.id), row]))
    this.#onChange = onChange
  }

  /** All records in insertion order. Records are immutable snapshots: never mutate them. */
  all(): T[] {
    return [...this.#rows.values()]
  }

  get(id: Id): T | undefined {
    return this.#rows.get(String(id))
  }

  has(id: Id): boolean {
    return this.#rows.has(String(id))
  }

  find(predicate: (record: T) => boolean): T | undefined {
    for (const record of this.#rows.values()) if (predicate(record)) return record
    return undefined
  }

  filter(predicate: (record: T) => boolean): T[] {
    return this.all().filter(predicate)
  }

  count(predicate?: (record: T) => boolean): number {
    return predicate ? this.filter(predicate).length : this.#rows.size
  }

  insert(record: T): T {
    const key = String(record.id)
    if (this.#rows.has(key)) throw new Error(`${this.name}: duplicate id ${key}`)
    this.#rows.set(key, record)
    this.#onChange()
    return record
  }

  insertMany(records: readonly T[]): T[] {
    for (const record of records) {
      const key = String(record.id)
      if (this.#rows.has(key)) throw new Error(`${this.name}: duplicate id ${key}`)
      this.#rows.set(key, record)
    }
    this.#onChange()
    return [...records]
  }

  /** Replace or merge a record; returns the new record, or undefined when it does not exist. */
  update(id: Id, patch: Patch<T>): T | undefined {
    const key = String(id)
    const current = this.#rows.get(key)
    if (!current) return undefined
    const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch }
    this.#rows.set(key, { ...next, id: current.id })
    this.#onChange()
    return this.#rows.get(key)
  }

  upsert(record: T): T {
    this.#rows.set(String(record.id), record)
    this.#onChange()
    return record
  }

  remove(id: Id): boolean {
    const removed = this.#rows.delete(String(id))
    if (removed) this.#onChange()
    return removed
  }

  removeWhere(predicate: (record: T) => boolean): number {
    let removed = 0
    for (const [key, record] of this.#rows) {
      if (predicate(record)) {
        this.#rows.delete(key)
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

  /** Next integer id (max numeric id + 1), for collections with numeric ids. */
  nextNumericId(): number {
    let max = 0
    for (const record of this.#rows.values()) {
      const value = Number(record.id)
      if (Number.isFinite(value) && value > max) max = value
    }
    return max + 1
  }
}

// --- seeds -----------------------------------------------------------------------------

export interface SeedContext {
  db: DemoDatabase
  /** Faker seeded from the module name: same data on every reseed (for the same refDate). */
  faker: Faker
  /** Start of the day the data was seeded; relative dates ("next Tuesday") build on it. */
  refDate: Date
}

export interface SeedDefinition {
  /** Module folder name, e.g. `requests`. */
  module: string
  /** Bump when the module's collections or seed data change shape (forces a reseed). */
  version: number
  /** Lower runs first (core = 0). Seeds can read collections of earlier seeds. Default 100. */
  order?: number
  run(ctx: SeedContext): void
}

const DEMO_SEED = 20_261_013
export const DB_STORAGE_KEY = 'hangar.demo-db.v1'

function hashString(value: string): number {
  let hash = 2_166_136_261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

export function createSeedFaker(module: string, refDate: Date): Faker {
  const faker = new Faker({ locale: [en, base] })
  faker.seed(DEMO_SEED + hashString(module))
  faker.setDefaultRefDate(refDate)
  return faker
}

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function sortSeeds(seeds: readonly SeedDefinition[]): SeedDefinition[] {
  return [...seeds].sort(
    (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.module.localeCompare(b.module),
  )
}

function manifestOf(seeds: readonly SeedDefinition[]): string {
  return sortSeeds(seeds)
    .map((seed) => `${seed.module}@${seed.version}`)
    .join(',')
}

// --- database --------------------------------------------------------------------------

type Snapshot = Record<string, BaseRecord[]>

interface PersistedDatabase {
  manifest: string
  refDate: string
  savedAt: string
  collections: Snapshot
}

export interface InitOptions {
  /** Where to persist; `null` keeps everything in memory (tests). Default: localStorage. */
  storage?: Storage | null
  /** Override "today" (tests). */
  refDate?: Date
}

export class DemoDatabase {
  #collections = new Map<string, Collection<BaseRecord>>()
  #seeds: SeedDefinition[] = []
  #storage: Storage | null = null
  #refDate: Date = startOfToday()
  #initialized = false
  #saveTimer: ReturnType<typeof setTimeout> | undefined
  #persistFailed = false
  /** Pristine seeded snapshot, so `reset()` in tests does not rerun every seed. */
  #seededSnapshot: { key: string; data: Snapshot } | undefined

  get initialized(): boolean {
    return this.#initialized
  }

  get refDate(): Date {
    return new Date(this.#refDate)
  }

  collection<K extends CollectionName>(name: K): Collection<RecordOf<K>> {
    return this.#collection(name) as unknown as Collection<RecordOf<K>>
  }

  /** Load from storage when the version manifest matches, otherwise (re)seed. */
  init(seeds: readonly SeedDefinition[], options: InitOptions = {}): { seeded: boolean } {
    this.#seeds = sortSeeds(seeds)
    this.#storage =
      options.storage === undefined ? (globalThis.localStorage ?? null) : options.storage
    this.#refDate = options.refDate ?? startOfToday()
    this.#initialized = true

    const persisted = this.#readPersisted()
    if (persisted?.manifest === manifestOf(this.#seeds)) {
      this.#refDate = new Date(persisted.refDate)
      this.#load(persisted.collections)
      return { seeded: false }
    }
    this.#reseed()
    return { seeded: true }
  }

  /** Throw away all changes and reseed relative to today (the "Reset demo data" action). */
  reset(options: { refDate?: Date } = {}): void {
    this.#assertInitialized()
    this.#refDate = options.refDate ?? startOfToday()
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

  #collection(name: string): Collection<BaseRecord> {
    this.#assertInitialized()
    let collection = this.#collections.get(name)
    if (!collection) {
      collection = new Collection<BaseRecord>(name, [], () => this.#scheduleSave())
      this.#collections.set(name, collection)
    }
    return collection
  }

  #assertInitialized(): void {
    if (!this.#initialized) {
      throw new Error('Demo database not initialised: call initDemoDb(seeds) first.')
    }
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
    const cacheKey = `${manifestOf(this.#seeds)}|${this.#refDate.toISOString()}`
    if (this.#seededSnapshot?.key === cacheKey) {
      this.#load(structuredClone(this.#seededSnapshot.data))
    } else {
      this.#collections.clear()
      for (const seed of this.#seeds) {
        seed.run({
          db: this,
          faker: createSeedFaker(seed.module, this.#refDate),
          refDate: this.refDate,
        })
      }
      this.#seededSnapshot = { key: cacheKey, data: this.snapshot() }
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
    }, 100)
  }

  #save(): void {
    if (!this.#storage || this.#persistFailed) return
    const payload: PersistedDatabase = {
      manifest: manifestOf(this.#seeds),
      refDate: this.#refDate.toISOString(),
      savedAt: new Date().toISOString(),
      collections: this.snapshot(),
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

export function initDemoDb(
  seeds: readonly SeedDefinition[],
  options?: InitOptions,
): { seeded: boolean } {
  return db.init(seeds, options)
}

/** Discard every change made in the demo and restore the seeded data. */
export function resetDemoData(): void {
  db.reset()
}
