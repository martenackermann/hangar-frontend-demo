/**
 * Incremental persistence of the demo database (`src/mocks/db.ts`).
 *
 * The database is stored as small records in one key-value store (IndexedDB in the browser,
 * see `src/mocks/idb-storage.ts`; Web Storage or memory in tests), all under `DB_PREFIX`:
 *
 *   <prefix>/meta              manifest, today, shiftDays, epoch, generation and the generation
 *                              of every record below
 *   <prefix>/head              the fixture without its tables (meta, enums, config), so a restored
 *                              demo never needs to fetch or parse seed.json
 *   <prefix>/t/<table>         the table's row ids in insertion order
 *   <prefix>/t/<table>/<n>     the rows whose id is in [n × 64, n × 64 + 64)
 *
 * A save writes only the buckets that changed (plus the id list when rows were added or removed)
 * and the meta record. Each record carries the generation it was written with and the meta record
 * lists the generation it expects for every record, so a torn write (a crash between two records
 * on a non-transactional store) never loads as valid: the database is reseeded instead. The
 * IndexedDB store writes one save in one transaction, which is atomic anyway.
 *
 * `epoch` changes on every full write (seed, reset). A partial save whose epoch is no longer the
 * stored one (another tab reset the demo meanwhile) is written as a full save instead, so the
 * stored database is always one consistent state.
 */

export const DB_FORMAT = 4
export const DB_PREFIX = 'hangar.demo-db.v4'
/** Keys of older formats (one snapshot of the whole database per save); deleted on boot. */
export const LEGACY_DB_KEYS = ['hangar.demo-db.v3']
export const BUCKET_SIZE = 64

export interface StoredRow {
  id: number
}

export function bucketOf(id: number): number {
  return Math.floor(id / BUCKET_SIZE)
}

export interface PersistedHeader {
  /** Fixture identity + slice seed versions; a different one means "reseed". */
  manifest: string
  /** Business date the data was shifted to. */
  today: string
  shiftDays: number
  /** Changes on every full write (seed / reset). */
  epoch: string
  savedAt: string
}

export interface PersistedMeta extends PersistedHeader {
  format: typeof DB_FORMAT
  /** Incremented on every save. */
  generation: number
  /** Record key (relative to the prefix) → the generation it was last written with. */
  records: Record<string, number>
}

/** A validated database read back from storage. */
export interface PersistedDatabase extends PersistedHeader {
  generation: number
  /** The fixture without its tables. */
  head: unknown
  tables: Record<string, StoredRow[]>
}

export interface TableChange {
  /** All row ids in insertion order; set when rows were added or removed. */
  ids?: number[]
  /** Changed buckets with their current rows (an empty list deletes the bucket). */
  buckets: Map<number, StoredRow[]>
}

export interface SaveRequest {
  header: PersistedHeader
  /** Replace everything stored (seed, reset): `changes` holds every table, `head` is set. */
  full: boolean
  head?: unknown
  changes: Map<string, TableChange>
  /** The same save as a full one, for when the stored database belongs to another epoch. */
  asFull(): SaveRequest
}

/** Where the demo database is persisted. */
export interface DemoStorage {
  /** The stored database, validated (synchronous: the browser preloads it before `open`). */
  read(): PersistedDatabase | undefined
  /** Store one save, atomically where the backend can (IndexedDB: one transaction). */
  write(request: SaveRequest): void | Promise<void>
}

interface GenerationRecord {
  g: number
}
interface HeadRecord extends GenerationRecord {
  value: unknown
}
interface IdsRecord extends GenerationRecord {
  ids: number[]
}
interface BucketRecord extends GenerationRecord {
  rows: StoredRow[]
}

export const metaKey = (prefix = DB_PREFIX): string => `${prefix}/meta`
const recordKey = (relative: string, prefix: string) => `${prefix}/${relative}`
const idsRelative = (table: string) => `t/${table}`
const bucketRelative = (table: string, bucket: number) => `t/${table}/${bucket}`
const TABLE_IDS = /^t\/([^/]+)$/

function isMeta(value: unknown): value is PersistedMeta {
  const meta = value as Partial<PersistedMeta> | undefined
  return (
    !!meta &&
    meta.format === DB_FORMAT &&
    typeof meta.manifest === 'string' &&
    typeof meta.generation === 'number' &&
    !!meta.records &&
    typeof meta.records === 'object'
  )
}

/** Every record key a meta record expects (absolute), meta itself excluded. */
export function recordKeys(meta: unknown, prefix = DB_PREFIX): string[] {
  return isMeta(meta) ? Object.keys(meta.records).map((key) => recordKey(key, prefix)) : []
}

export interface WritePlan {
  meta: PersistedMeta
  /** Delete every stored record first (full writes). */
  clear: boolean
  /** Absolute key → value, meta last (non-transactional stores write in this order). */
  puts: [string, unknown][]
  deletes: string[]
}

/**
 * Turn a save into record writes against what is stored now (`stored` = the current meta record,
 * read in the same transaction).
 */
export function planSave(stored: unknown, request: SaveRequest, prefix = DB_PREFIX): WritePlan {
  const previous = isMeta(stored) ? stored : undefined
  const sameDatabase =
    previous?.epoch === request.header.epoch && previous.manifest === request.header.manifest
  const save = request.full || sameDatabase ? request : request.asFull()
  const generation = (previous?.generation ?? 0) + 1
  const records: Record<string, number> = save.full ? {} : { ...previous?.records }
  const puts: [string, unknown][] = []
  const deletes = new Set<string>()
  const drop = (relative: string) => {
    if (relative in records) {
      delete records[relative]
      deletes.add(recordKey(relative, prefix))
    }
  }
  const put = <R extends GenerationRecord>(relative: string, value: R) => {
    records[relative] = generation
    deletes.delete(recordKey(relative, prefix))
    puts.push([recordKey(relative, prefix), value])
  }

  if (save.full) put<HeadRecord>('head', { g: generation, value: save.head })
  for (const [table, change] of save.changes) {
    if (change.ids) {
      put<IdsRecord>(idsRelative(table), { g: generation, ids: change.ids })
      const live = new Set(change.ids.map(bucketOf))
      const bucketPrefix = `${idsRelative(table)}/`
      for (const relative of Object.keys(records)) {
        if (
          relative.startsWith(bucketPrefix) &&
          !live.has(Number(relative.slice(bucketPrefix.length)))
        )
          drop(relative)
      }
    }
    for (const [bucket, rows] of change.buckets) {
      if (rows.length === 0) drop(bucketRelative(table, bucket))
      else put<BucketRecord>(bucketRelative(table, bucket), { g: generation, rows })
    }
  }

  const meta: PersistedMeta = { ...save.header, format: DB_FORMAT, generation, records }
  puts.push([metaKey(prefix), meta])
  return { meta, clear: save.full, puts, deletes: [...deletes] }
}

/**
 * Read and validate a stored database through `get` (absolute key → stored value). Returns
 * undefined when nothing is stored, the format is unknown or any record is missing or from
 * another generation than the meta record expects (torn write).
 */
export function readPersisted(
  get: (key: string) => unknown,
  prefix = DB_PREFIX,
): PersistedDatabase | undefined {
  const meta = get(metaKey(prefix))
  if (!isMeta(meta)) return undefined
  const record = <R extends GenerationRecord>(relative: string): R | undefined => {
    const value = get(recordKey(relative, prefix)) as R | undefined
    return value && typeof value === 'object' && value.g === meta.records[relative]
      ? value
      : undefined
  }
  const head = record<HeadRecord>('head')
  if (!head) return undefined

  const bucketsOf = new Map<string, string[]>()
  for (const relative of Object.keys(meta.records)) {
    const [kind, table, bucket] = relative.split('/')
    if (kind === 't' && table && bucket !== undefined) {
      const list = bucketsOf.get(table) ?? []
      list.push(relative)
      bucketsOf.set(table, list)
    }
  }

  const tables: Record<string, StoredRow[]> = {}
  for (const relative of Object.keys(meta.records)) {
    const table = TABLE_IDS.exec(relative)?.[1]
    if (!table) continue
    const ids = record<IdsRecord>(relative)
    if (!ids || !Array.isArray(ids.ids)) return undefined
    const byId = new Map<number, StoredRow>()
    for (const bucketKey of bucketsOf.get(table) ?? []) {
      const bucket = record<BucketRecord>(bucketKey)
      if (!bucket || !Array.isArray(bucket.rows)) return undefined
      for (const row of bucket.rows) byId.set(row.id, row)
    }
    const rows: StoredRow[] = []
    for (const id of ids.ids) {
      const row = byId.get(id)
      if (!row) return undefined
      rows.push(row)
    }
    tables[table] = rows
  }

  return {
    manifest: meta.manifest,
    today: meta.today,
    shiftDays: meta.shiftDays,
    epoch: meta.epoch,
    savedAt: meta.savedAt,
    generation: meta.generation,
    head: head.value,
    tables,
  }
}

/**
 * A `DemoStorage` over a Web Storage object (tests, small datasets): one JSON item per record,
 * the meta record written after the records it lists.
 */
export function webStorage(storage: Storage, prefix = DB_PREFIX): DemoStorage {
  const get = (key: string): unknown => {
    const raw = storage.getItem(key)
    return raw === null ? undefined : (JSON.parse(raw) as unknown)
  }
  return {
    read: () => readPersisted(get, prefix),
    write: (request) => {
      const plan = planSave(get(metaKey(prefix)), request, prefix)
      for (const [key, value] of plan.puts) storage.setItem(key, JSON.stringify(value))
      for (const key of plan.deletes) storage.removeItem(key)
      if (plan.clear) {
        const keep = new Set([metaKey(prefix), ...recordKeys(plan.meta, prefix)])
        const stale: string[] = []
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i)
          if (key?.startsWith(`${prefix}/`) && !keep.has(key)) stale.push(key)
        }
        for (const key of stale) storage.removeItem(key)
      }
    },
  }
}

/** A fresh epoch id (not seeded data, so `Math.random` is fine here). */
export function newEpoch(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
