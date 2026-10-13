import type * as FakerLib from '@faker-js/faker'
import type { Faker } from '@faker-js/faker'
import { addDays, businessToday, daysBetween } from '@/lib/format'
import {
  bucketOf,
  newEpoch,
  type DemoStorage,
  type PersistedDatabase,
  type SaveRequest,
  type StoredRow,
  type TableChange,
} from './persistence'

export {
  DB_PREFIX,
  webStorage,
  type DemoStorage,
  type PersistedDatabase,
  type SaveRequest,
} from './persistence'

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
 * - Persistence (`./persistence.ts`): every change marks its rows dirty; a save (debounced, or
 *   awaited through `persist()`) writes only the changed 64-row buckets of the changed tables
 *   through a `DemoStorage` (IndexedDB in the browser, see `src/mocks/idb-storage.ts`). A changed
 *   fixture or seed `version` reseeds. "Reset demo data" reloads the fixture for today.
 * - A restored database needs neither the fixture nor faker: `open()` restores it, `seed()`
 *   (first visit, changed manifest) and `reset()` need the fixture and `loadSeedFaker()`.
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

/** Rows that changed (`'all'`: every row) and whether rows were added or removed. */
type ChangeListener = (ids: Iterable<Id> | 'all', membership: boolean) => void

/**
 * Rows are immutable snapshots: persistence writes only rows reported through the collection
 * API and shares row objects between the live tables and the reset cache. Dev and tests freeze
 * every stored row so an in-place mutation fails loudly instead of silently not being saved.
 */
const freeze: <T>(row: T) => T = import.meta.env.DEV ? deepFreeze : (row) => row

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const inner of Object.values(value)) deepFreeze(inner)
  }
  return value
}

export class Collection<T extends BaseRecord> {
  readonly name: string
  readonly #rows: Map<number, T>
  readonly #onChange: ChangeListener

  constructor(name: string, rows: readonly T[], onChange: ChangeListener) {
    this.name = name
    this.#rows = new Map(rows.map((row) => [row.id, freeze(row)]))
    this.#onChange = onChange
  }

  /** All rows in insertion order. Rows are immutable snapshots: never mutate them. */
  all(): T[] {
    return [...this.#rows.values()]
  }

  /** Row ids in insertion order. */
  ids(): Id[] {
    return [...this.#rows.keys()]
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
    const stored = freeze({ ...row, id } as T)
    this.#rows.set(id, stored)
    this.#onChange([id], true)
    return stored
  }

  insertMany(rows: readonly T[]): T[] {
    for (const row of rows) {
      if (this.#rows.has(row.id)) throw new Error(`${this.name}: duplicate id ${row.id}`)
      this.#rows.set(row.id, freeze(row))
    }
    this.#onChange(
      rows.map((row) => row.id),
      true,
    )
    return [...rows]
  }

  /** Merge or replace a row; returns the new row, or undefined when it does not exist. */
  update(id: Id, patch: Patch<T>): T | undefined {
    const current = this.#rows.get(Number(id))
    if (!current) return undefined
    const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch }
    const stored = freeze({ ...next, id: current.id })
    this.#rows.set(current.id, stored)
    this.#onChange([current.id], false)
    return stored
  }

  upsert(row: T): T {
    const existed = this.#rows.has(row.id)
    this.#rows.set(row.id, freeze(row))
    this.#onChange([row.id], !existed)
    return row
  }

  remove(id: Id): boolean {
    const removed = this.#rows.delete(Number(id))
    if (removed) this.#onChange([Number(id)], true)
    return removed
  }

  removeWhere(predicate: (row: T) => boolean): number {
    const removed: Id[] = []
    for (const [id, row] of this.#rows) {
      if (predicate(row)) {
        this.#rows.delete(id)
        removed.push(id)
      }
    }
    if (removed.length > 0) this.#onChange(removed, true)
    return removed.length
  }

  clear(): void {
    this.#rows.clear()
    this.#onChange('all', true)
  }
}

// ---- fixture & seeds ---------------------------------------------------------------------

/** Fixture identity and anchor (`seed.json` → `meta`). */
export interface FixtureMeta {
  version: number
  generatedAt: string
  anchorDate: string
}

/** The parts of `seed.json` the loader needs (full type: src/mocks/fixtures/types.ts). */
export interface FixtureLike {
  meta: FixtureMeta
  tables: Record<string, readonly unknown[] | undefined>
}

/** The fixture without its tables (meta, enums, config), persisted with the database. */
export type FixtureHead = { meta: FixtureMeta } & Record<string, unknown>

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

type FakerModule = Pick<typeof FakerLib, 'Faker' | 'en' | 'base'>
let fakerModule: FakerModule | null = null

/**
 * Faker (~400 kB) is only needed to (re)seed, so the browser loads it on demand; tests provide
 * it statically (`src/mocks/node.ts`).
 */
export function provideSeedFaker(module: FakerModule): void {
  fakerModule = module
}

export async function loadSeedFaker(): Promise<void> {
  fakerModule ??= await import('@faker-js/faker')
}

function hashString(value: string): number {
  let hash = 2_166_136_261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

export function createSeedFaker(module: string, today: string): Faker {
  if (!fakerModule) throw new Error('Seeding needs faker: await loadSeedFaker() first.')
  const { Faker, en, base } = fakerModule
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

/** Identity of a demo dataset: the fixture plus every slice seed version. */
export function manifestOf(meta: FixtureMeta, seeds: readonly SeedDefinition[]): string {
  return [
    `fixture@${meta.version}:${meta.generatedAt}`,
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

export interface OpenOptions {
  /** Identity of the fixture the stored database must have been seeded from. */
  fixtureMeta: FixtureMeta
  seeds?: readonly SeedDefinition[]
  /** Where to persist; `null`/omitted keeps everything in memory (tests). */
  storage?: DemoStorage | null
  /** Override "today" (tests). */
  today?: string
}

export interface InitOptions extends Omit<OpenOptions, 'fixtureMeta'> {
  fixture: FixtureLike
}

/** What the last saves wrote (debugging and the perf notes in CONVENTIONS.md §10). */
export interface PersistStats {
  saves: number
  lastFull: boolean
  /** `table` or `table/bucket` per record written by the last save (ids lists as `table#ids`). */
  lastRecords: string[]
  lastRows: number
}

interface DirtyTable {
  membership: boolean
  ids: Set<Id> | 'all'
}

export class DemoDatabase {
  #collections = new Map<string, Collection<BaseRecord>>()
  #fixtureMeta: FixtureMeta | null = null
  #fixture: FixtureLike | null = null
  #head: FixtureHead | null = null
  #seeds: SeedDefinition[] = []
  #storage: DemoStorage | null = null
  #today = businessToday()
  #shiftDays = 0
  #epoch = ''
  #dirty = new Map<string, DirtyTable>()
  #fullPending = false
  #saveTimer: ReturnType<typeof setTimeout> | undefined
  #lastWrite: Promise<void> = Promise.resolve()
  #persistFailed = false
  #seeded: { key: string; shiftDays: number; data: Snapshot } | undefined
  #stats: PersistStats = { saves: 0, lastFull: false, lastRecords: [], lastRows: 0 }

  get initialized(): boolean {
    return this.#fixtureMeta !== null
  }

  /** Business date the data was shifted to. */
  get today(): string {
    return this.#today
  }

  /** Days the fixture dates were shifted by (multiple of 7). */
  get shiftDays(): number {
    return this.#shiftDays
  }

  /** The fixture without its tables: from the loaded fixture or the stored database. */
  get fixtureHead(): FixtureHead | null {
    return this.#head
  }

  get persistStats(): PersistStats {
    return { ...this.#stats, lastRecords: [...this.#stats.lastRecords] }
  }

  collection<K extends CollectionName>(name: K): Collection<RecordOf<K>> {
    return this.table<RecordOf<K>>(name)
  }

  /** Untyped access for generic code (workflow engine, slices before declaring their types). */
  table<T extends BaseRecord>(name: string): Collection<T> {
    this.#assertInitialized()
    let collection = this.#collections.get(name)
    if (!collection) {
      collection = new Collection<BaseRecord>(name, [], this.#listener(name))
      this.#collections.set(name, collection)
    }
    return collection as unknown as Collection<T>
  }

  tableNames(): string[] {
    return [...this.#collections.keys()]
  }

  /**
   * Restore the stored database when it was seeded from this fixture and these seed versions.
   * Needs neither the fixture's tables nor faker. Returns false when the caller must `seed()`.
   */
  open({ fixtureMeta, seeds = [], storage, today }: OpenOptions): boolean {
    this.#fixtureMeta = fixtureMeta
    this.#seeds = sortSeeds(seeds)
    this.#storage = storage ?? null
    this.#today = today ?? businessToday()
    this.#clearPending()

    const persisted = this.#readPersisted()
    if (persisted?.manifest !== manifestOf(fixtureMeta, this.#seeds)) return false
    this.#today = persisted.today
    this.#shiftDays = persisted.shiftDays
    this.#epoch = persisted.epoch
    this.#head = persisted.head as FixtureHead
    this.#load(persisted.tables)
    return true
  }

  /** Load the fixture for today, run the slice seeds and write everything (after `open()`). */
  seed(fixture: FixtureLike): void {
    this.#attach(fixture)
    this.#reseed()
  }

  /** `open()` the stored database, or `seed()` from the fixture when there is none (or stale). */
  init({ fixture, ...options }: InitOptions): { seeded: boolean } {
    if (this.open({ ...options, fixtureMeta: fixture.meta })) {
      this.#fixture = fixture
      return { seeded: false }
    }
    this.seed(fixture)
    return { seeded: true }
  }

  /**
   * Throw away all changes and reload the fixture for today ("Reset demo data"). A restored
   * database has no fixture yet: pass it (and `await loadSeedFaker()` first).
   */
  reset(options: { today?: string; fixture?: FixtureLike } = {}): void {
    this.#assertInitialized()
    if (options.fixture) this.#attach(options.fixture)
    if (!this.#fixture) throw new Error('Reset needs the demo fixture: pass it to reset().')
    this.#today = options.today ?? businessToday()
    this.#reseed()
  }

  /** Start writing pending changes now (normally debounced); e.g. on `pagehide`. */
  flush(): void {
    if (this.#saveTimer !== undefined) {
      clearTimeout(this.#saveTimer)
      this.#saveTimer = undefined
    }
    void this.#save()
  }

  /**
   * Write pending changes now and resolve once the storage has them (and every earlier save).
   * The browser mock awaits it before answering a mutating request, so a reload right after a
   * response keeps the change.
   */
  persist(): Promise<void> {
    this.flush()
    return this.#lastWrite
  }

  /** Deep copy of every table (debugging). */
  snapshot(): Snapshot {
    return structuredClone(this.#rowsByTable())
  }

  #assertInitialized(): void {
    if (!this.#fixtureMeta)
      throw new Error('Demo database not initialised: call initDemoDb(...) first.')
  }

  #attach(fixture: FixtureLike): void {
    this.#fixture = fixture
    this.#fixtureMeta = fixture.meta
    const { tables: _tables, ...head } = fixture as FixtureLike & Record<string, unknown>
    void _tables
    this.#head = head
  }

  #rowsByTable(): Snapshot {
    const data: Snapshot = {}
    for (const [name, collection] of this.#collections) data[name] = collection.all()
    return data
  }

  #load(data: Readonly<Record<string, readonly BaseRecord[]>>): void {
    this.#collections.clear()
    for (const [name, rows] of Object.entries(data)) {
      this.#collections.set(name, new Collection<BaseRecord>(name, rows, this.#listener(name)))
    }
  }

  #reseed(): void {
    const fixture = this.#fixture
    if (!fixture) return
    // Everything is rewritten below: no need to track the seeds' inserts row by row.
    this.#fullPending = true
    const cacheKey = `${manifestOf(fixture.meta, this.#seeds)}|${this.#today}`
    if (this.#seeded?.key === cacheKey) {
      // Rows are immutable, so the cached seed result is shared, not copied.
      this.#shiftDays = this.#seeded.shiftDays
      this.#load(this.#seeded.data)
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
      this.#seeded = { key: cacheKey, shiftDays: this.#shiftDays, data: this.#rowsByTable() }
    }
    this.#epoch = newEpoch()
    this.#dirty.clear()
    this.#fullPending = true
    this.flush()
  }

  #readPersisted(): PersistedDatabase | undefined {
    if (!this.#storage) return undefined
    try {
      return this.#storage.read()
    } catch {
      return undefined
    }
  }

  #listener(table: string): ChangeListener {
    return (ids, membership) => {
      if (!this.#storage || this.#persistFailed) return
      if (!this.#fullPending) {
        let dirty = this.#dirty.get(table)
        if (!dirty) {
          dirty = { membership: false, ids: new Set() }
          this.#dirty.set(table, dirty)
        }
        dirty.membership ||= membership
        if (ids === 'all') dirty.ids = 'all'
        else if (dirty.ids !== 'all') for (const id of ids) dirty.ids.add(id)
      }
      this.#scheduleSave()
    }
  }

  #clearPending(): void {
    if (this.#saveTimer !== undefined) clearTimeout(this.#saveTimer)
    this.#saveTimer = undefined
    this.#dirty.clear()
    this.#fullPending = false
  }

  #scheduleSave(): void {
    if (!this.#storage || this.#saveTimer !== undefined) return
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = undefined
      void this.#save()
    }, 150)
  }

  /** The pending changes as a save request; clears them. */
  #takeSave(): SaveRequest {
    const header = {
      manifest: this.#fixtureMeta ? manifestOf(this.#fixtureMeta, this.#seeds) : '',
      today: this.#today,
      shiftDays: this.#shiftDays,
      epoch: this.#epoch,
      savedAt: new Date().toISOString(),
    }
    const fullSave = (): SaveRequest => {
      const changes = new Map<string, TableChange>()
      for (const [name, collection] of this.#collections) {
        changes.set(name, tableChange(collection, 'all', true))
      }
      return { header, full: true, head: this.#head, changes, asFull: fullSave }
    }
    if (this.#fullPending) {
      this.#dirty.clear()
      this.#fullPending = false
      return fullSave()
    }
    const changes = new Map<string, TableChange>()
    for (const [name, dirty] of this.#dirty) {
      const collection = this.#collections.get(name)
      if (collection) changes.set(name, tableChange(collection, dirty.ids, dirty.membership))
    }
    this.#dirty.clear()
    return { header, full: false, changes, asFull: fullSave }
  }

  #save(): Promise<void> {
    if (!this.#storage || this.#persistFailed || !this.#fixtureMeta) return this.#lastWrite
    if (!this.#fullPending && this.#dirty.size === 0) return this.#lastWrite
    const request = this.#takeSave()
    this.#recordStats(request)
    const fail = (error: unknown) => {
      // Quota exceeded or storage disabled: keep working in memory.
      this.#persistFailed = true
      console.warn('[demo] Could not persist demo data; changes are kept in memory only.', error)
    }
    try {
      const pending = this.#storage.write(request)
      // IndexedDB runs the transactions in order: the last one settling means all have.
      if (pending) this.#lastWrite = pending.catch(fail)
    } catch (error) {
      fail(error)
    }
    return this.#lastWrite
  }

  #recordStats(request: SaveRequest): void {
    const records: string[] = []
    let rows = 0
    for (const [table, change] of request.changes) {
      if (change.ids) records.push(`${table}#ids`)
      for (const [bucket, bucketRows] of change.buckets) {
        records.push(`${table}/${bucket}`)
        rows += bucketRows.length
      }
    }
    this.#stats = {
      saves: this.#stats.saves + 1,
      lastFull: request.full,
      lastRecords: records,
      lastRows: rows,
    }
  }
}

/** Rows of the changed buckets of one table (all buckets for `'all'`), plus its ids if needed. */
function tableChange(
  collection: Collection<BaseRecord>,
  ids: Set<Id> | 'all',
  membership: boolean,
): TableChange {
  const wanted = ids === 'all' ? null : new Set([...ids].map(bucketOf))
  const buckets = new Map<number, StoredRow[]>()
  if (wanted) for (const bucket of wanted) buckets.set(bucket, [])
  for (const row of collection.all()) {
    const bucket = bucketOf(row.id)
    if (wanted && !wanted.has(bucket)) continue
    let list = buckets.get(bucket)
    if (!list) {
      list = []
      buckets.set(bucket, list)
    }
    list.push(row)
  }
  return { ids: membership ? collection.ids() : undefined, buckets }
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
