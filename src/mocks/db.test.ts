import { beforeEach, describe, expect, it } from 'vitest'
import {
  DB_PREFIX,
  DemoDatabase,
  webStorage,
  shiftDates,
  weekShiftDays,
  type DemoStorage,
  type FixtureLike,
  type SaveRequest,
  type SeedDefinition,
} from './db'
import { BUCKET_SIZE, planSave } from './persistence'

interface Widget {
  id: number
  name: string
  site: string
  status: 'new' | 'done'
  dueOn: string
  createdAt: string
}

function fixture(generatedAt = '2026-10-13T05:50:00Z'): FixtureLike & { enums: unknown } {
  return {
    meta: { version: 1, generatedAt, anchorDate: '2026-10-13' },
    enums: { role: ['admin'] },
    tables: {
      widgets: [
        {
          id: 1,
          name: 'Dock',
          site: 'Riverton',
          status: 'new',
          dueOn: '2026-10-14',
          createdAt: '2026-10-12T08:00:00Z',
        },
        {
          id: 2,
          name: 'Arm',
          site: 'Hillford',
          status: 'new',
          dueOn: '2026-10-20',
          createdAt: '2026-10-01T08:00:00Z',
        },
      ],
      // three buckets' worth of rows (ids 1 … 150)
      parts: Array.from({ length: 150 }, (_, i) => ({ id: i + 1, label: `P${i + 1}` })),
    },
  }
}

const seed = (version: number): SeedDefinition => ({
  module: 'test',
  version,
  run: ({ db, faker }) => {
    db.table<{ id: number; label: string }>('gadgets').insert({
      label: faker.commerce.productName(),
    })
  },
})

/** A Web Storage in memory that remembers which keys were written. */
class RecordingStorage implements Storage {
  #items = new Map<string, string>()
  written: string[] = []
  get length() {
    return this.#items.size
  }
  clear() {
    this.#items.clear()
  }
  getItem(key: string) {
    return this.#items.get(key) ?? null
  }
  key(index: number) {
    return [...this.#items.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.#items.delete(key)
  }
  setItem(key: string, value: string) {
    this.written.push(key)
    this.#items.set(key, value)
  }
  keys() {
    return [...this.#items.keys()]
  }
}

const relative = (keys: string[]) => keys.map((key) => key.slice(DB_PREFIX.length + 1))

function open(storage: Storage, options: { seeds?: SeedDefinition[]; generatedAt?: string } = {}) {
  const db = new DemoDatabase()
  const result = db.init({
    fixture: fixture(options.generatedAt),
    seeds: options.seeds ?? [seed(1)],
    storage: webStorage(storage),
    today: '2026-10-13',
  })
  return { db, ...result }
}

describe('DemoDatabase', () => {
  beforeEach(() => localStorage.clear())

  it('shifts fixture dates by whole weeks to today (SPEC_RESOLUTIONS #47)', () => {
    expect(weekShiftDays('2026-10-13', '2026-10-13')).toBe(0)
    expect(weekShiftDays('2026-10-13', '2026-10-16')).toBe(0)
    expect(weekShiftDays('2026-10-13', '2026-10-17')).toBe(7)
    expect(weekShiftDays('2026-10-13', '2026-12-01')).toBe(49)
    expect(
      shiftDates({ d: '2026-10-14', t: '2026-10-12T08:00:00Z', s: 'SR0012001', n: 3 }, 7),
    ).toEqual({
      d: '2026-10-21',
      t: '2026-10-19T08:00:00.000Z',
      s: 'SR0012001',
      n: 3,
    })
    const db = new DemoDatabase()
    db.init({ fixture: fixture(), storage: null, today: '2026-10-27' })
    expect(db.shiftDays).toBe(14)
    expect(db.table<Widget>('widgets').get(1)?.dueOn).toBe('2026-10-28')
  })

  it('supports CRUD and query helpers', () => {
    const db = new DemoDatabase()
    db.init({ fixture: fixture(), storage: null, today: '2026-10-13' })
    const widgets = db.table<Widget>('widgets')
    expect(widgets.filter((w) => w.site === 'Riverton')).toHaveLength(1)
    const before = widgets.get(1)
    const updated = widgets.update(1, { status: 'done' })
    expect(updated?.status).toBe('done')
    expect(before?.status).toBe('new') // rows are immutable snapshots
    expect(() => {
      ;(before as { status: string }).status = 'done' // and frozen in dev/tests
    }).toThrow(TypeError)
    expect(widgets.update(99, { status: 'done' })).toBeUndefined()
    const created = widgets.insert({
      name: 'Lamp',
      site: 'Eastgate',
      status: 'new',
      dueOn: '2026-10-13',
      createdAt: '',
    })
    expect(created.id).toBe(3)
    expect(() => widgets.insert({ ...created })).toThrow(/duplicate id/)
    expect(widgets.removeWhere((w) => w.status === 'done')).toBe(1)
    expect(widgets.count()).toBe(2)
  })

  it('runs slice seeds, persists, and restores the database when the manifest matches', () => {
    const first = open(localStorage)
    expect(first.seeded).toBe(true)
    expect(first.db.table('gadgets').count()).toBe(1)
    first.db.table<Widget>('widgets').update(2, { name: 'Changed' })
    first.db
      .table<Widget>('widgets')
      .insert({ ...first.db.table<Widget>('widgets').get(1)!, id: 9 })
    first.db.flush()

    const reloaded = open(localStorage)
    expect(reloaded.seeded).toBe(false)
    expect(reloaded.db.table<Widget>('widgets').get(2)?.name).toBe('Changed')
    // insertion order survives the bucketed storage
    expect(reloaded.db.table<Widget>('widgets').ids()).toEqual([1, 2, 9])
    expect(reloaded.db.table('parts').count()).toBe(150)
    expect(reloaded.db.table('gadgets').count()).toBe(1)
  })

  it('restores without the fixture: open() needs only its meta and brings the fixture head', () => {
    open(localStorage).db.flush()
    const db = new DemoDatabase()
    expect(
      db.open({ fixtureMeta: fixture().meta, seeds: [seed(1)], storage: webStorage(localStorage) }),
    ).toBe(true)
    expect(db.fixtureHead).toEqual({ meta: fixture().meta, enums: { role: ['admin'] } })
    expect(db.table('parts').count()).toBe(150)
    // a restored database cannot reset until it gets the fixture
    expect(() => db.reset()).toThrow(/needs the demo fixture/)
    db.table('parts').clear()
    db.reset({ fixture: fixture(), today: '2026-10-13' })
    expect(db.table('parts').count()).toBe(150)
  })

  it('writes only the changed buckets of the changed tables', () => {
    const storage = new RecordingStorage()
    const { db } = open(storage)
    expect(db.persistStats.lastFull).toBe(true)

    storage.written = []
    db.table<{ id: number; label: string }>('parts').update(70, { label: 'changed' })
    db.flush()
    // one bucket (ids 64–127), no id list (no row added or removed), then the meta record
    expect(relative(storage.written)).toEqual([`t/parts/${Math.floor(70 / BUCKET_SIZE)}`, 'meta'])
    expect(db.persistStats).toMatchObject({
      lastFull: false,
      lastRecords: ['parts/1'],
      lastRows: 64,
    })

    storage.written = []
    db.table<Widget>('widgets').remove(1)
    db.table<{ id: number; label: string }>('parts').insert({ label: 'new' })
    db.flush()
    expect(relative(storage.written).sort()).toEqual(
      ['meta', 't/parts', 't/parts/2', 't/widgets', 't/widgets/0'].sort(),
    )

    // nothing pending: nothing written
    storage.written = []
    db.flush()
    expect(storage.written).toEqual([])
  })

  it('drops buckets that lost all their rows', () => {
    const storage = new RecordingStorage()
    const { db } = open(storage)
    db.table<{ id: number }>('parts').removeWhere((row) => row.id > 64)
    db.flush()
    expect(relative(storage.keys()).filter((key) => key.startsWith('t/parts'))).toEqual([
      't/parts',
      't/parts/0',
      't/parts/1', // id 64 lives in bucket 1
    ])
    db.table('parts').clear()
    db.flush()
    expect(relative(storage.keys()).filter((key) => key.startsWith('t/parts'))).toEqual(['t/parts'])
    expect(open(storage).db.table('parts').count()).toBe(0)
  })

  it('reseeds when the fixture or a seed version changes', () => {
    const { db } = open(localStorage)
    db.table<Widget>('widgets').update(2, { name: 'Changed' })
    db.flush()

    const upgraded = open(localStorage, { seeds: [seed(2)] })
    expect(upgraded.seeded).toBe(true)
    expect(upgraded.db.table<Widget>('widgets').get(2)?.name).toBe('Arm')

    upgraded.db.table<Widget>('widgets').update(2, { name: 'Changed again' })
    upgraded.db.flush()
    const newFixture = open(localStorage, { seeds: [seed(2)], generatedAt: '2026-10-14T05:50:00Z' })
    expect(newFixture.seeded).toBe(true)
    expect(newFixture.db.table<Widget>('widgets').get(2)?.name).toBe('Arm')
  })

  it('reset() rewrites everything and leaves no stale records', () => {
    const storage = new RecordingStorage()
    const { db } = open(storage)
    db.table('extra').insert({ id: 1 })
    db.table<Widget>('widgets').update(2, { name: 'Changed' })
    db.flush()
    expect(relative(storage.keys())).toContain('t/extra')

    storage.written = []
    db.reset({ today: '2026-10-13' })
    expect(db.persistStats.lastFull).toBe(true)
    const keys = relative(storage.keys())
    expect(relative(storage.written)).toEqual(expect.arrayContaining(keys))
    expect(keys).not.toContain('t/extra')
    const reloaded = open(storage)
    expect(reloaded.seeded).toBe(false)
    expect(reloaded.db.table<Widget>('widgets').get(2)?.name).toBe('Arm')
    expect(reloaded.db.tableNames()).not.toContain('extra')
  })

  it('never loads a torn write: a record from another generation reseeds', () => {
    const storage = new RecordingStorage()
    const { db } = open(storage)
    db.table<Widget>('widgets').update(2, { name: 'Changed' })
    db.flush()
    // simulate a crash after a record was written but before the meta record listing it
    const key = `${DB_PREFIX}/t/widgets/0`
    const record = JSON.parse(storage.getItem(key) ?? '{}') as { g: number }
    storage.setItem(key, JSON.stringify({ ...record, g: record.g + 1 }))
    const reloaded = open(storage)
    expect(reloaded.seeded).toBe(true)
    expect(reloaded.db.table<Widget>('widgets').get(2)?.name).toBe('Arm')
  })

  it('writes a full save when another tab replaced the stored database (new epoch)', () => {
    const storage = new RecordingStorage()
    const tabA = open(storage).db
    const tabB = open(storage).db // restores the same epoch
    tabA.reset({ today: '2026-10-13' }) // new epoch in storage
    tabB.table<Widget>('widgets').update(2, { name: 'From B' })
    storage.written = []
    tabB.flush()
    // B cannot patch A's database: it writes its whole state instead
    expect(relative(storage.written)).toEqual(expect.arrayContaining(['head', 't/parts/2']))
    const reloaded = open(storage)
    expect(reloaded.seeded).toBe(false)
    expect(reloaded.db.table<Widget>('widgets').get(2)?.name).toBe('From B')
  })

  it('persist() resolves once an async storage has the change', async () => {
    const writes: SaveRequest[] = []
    let release: () => void = () => undefined
    const storage: DemoStorage = {
      read: () => undefined,
      write: (request) => {
        writes.push(request)
        return new Promise<void>((resolve) => (release = resolve))
      },
    }
    const db = new DemoDatabase()
    db.init({ fixture: fixture(), storage, today: '2026-10-13' })
    release()
    db.table<Widget>('widgets').update(1, { status: 'done' })
    let done = false
    const persisted = db.persist().then(() => (done = true))
    expect(writes.map((w) => w.full)).toEqual([true, false])
    await Promise.resolve()
    expect(done).toBe(false)
    release()
    await persisted
    expect(done).toBe(true)
    // the plan for that save: one bucket + meta
    const plan = planSave(undefined, writes[1]!)
    expect(plan.clear).toBe(true) // nothing stored yet → written in full
  })
})
