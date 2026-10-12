import { beforeEach, describe, expect, it } from 'vitest'
import { DB_STORAGE_KEY, DemoDatabase, type SeedDefinition } from './db'

interface Widget {
  id: string
  name: string
  site: string
  status: 'new' | 'done'
}

declare module './db' {
  interface DemoCollections {
    testWidgets: Widget
  }
}

const REF_DATE = new Date(2026, 9, 13)

function widgetSeed(version = 1): SeedDefinition {
  return {
    module: 'test',
    version,
    run: ({ db, faker }) => {
      db.collection('testWidgets').insertMany(
        Array.from({ length: 5 }, (_, i) => ({
          id: faker.string.uuid(),
          name: faker.commerce.productName(),
          site: ['Riverton', 'Hillford', 'Eastgate'][i % 3]!,
          status: 'new' as const,
        })),
      )
    },
  }
}

describe('DemoDatabase', () => {
  beforeEach(() => localStorage.clear())

  it('seeds deterministically', () => {
    const a = new DemoDatabase()
    const b = new DemoDatabase()
    a.init([widgetSeed()], { storage: null, refDate: REF_DATE })
    b.init([widgetSeed()], { storage: null, refDate: REF_DATE })
    expect(a.collection('testWidgets').all()).toEqual(b.collection('testWidgets').all())
    expect(a.collection('testWidgets').count()).toBe(5)
  })

  it('supports CRUD and query helpers', () => {
    const db = new DemoDatabase()
    db.init([widgetSeed()], { storage: null, refDate: REF_DATE })
    const widgets = db.collection('testWidgets')
    const first = widgets.all()[0]!

    expect(widgets.get(first.id)).toEqual(first)
    expect(widgets.filter((w) => w.site === 'Riverton')).toHaveLength(2)

    const updated = widgets.update(first.id, { status: 'done' })
    expect(updated?.status).toBe('done')
    expect(first.status).toBe('new') // records are immutable snapshots
    expect(widgets.update('missing', { status: 'done' })).toBeUndefined()

    widgets.insert({ id: 'w-new', name: 'Dock', site: 'Eastgate', status: 'new' })
    expect(() => widgets.insert({ id: 'w-new', name: 'x', site: 'x', status: 'new' })).toThrow(
      /duplicate id/,
    )
    expect(widgets.remove('w-new')).toBe(true)
    expect(widgets.removeWhere((w) => w.status === 'done')).toBe(1)
    expect(widgets.count()).toBe(4)
  })

  it('persists to storage and reloads when the seed manifest matches', () => {
    const db = new DemoDatabase()
    expect(db.init([widgetSeed()], { storage: localStorage, refDate: REF_DATE })).toEqual({
      seeded: true,
    })
    db.collection('testWidgets').insert({
      id: 'kept',
      name: 'Kept',
      site: 'Riverton',
      status: 'new',
    })
    db.flush()
    expect(localStorage.getItem(DB_STORAGE_KEY)).toContain('"kept"')

    const reloaded = new DemoDatabase()
    expect(reloaded.init([widgetSeed()], { storage: localStorage })).toEqual({ seeded: false })
    expect(reloaded.collection('testWidgets').get('kept')?.name).toBe('Kept')
    expect(reloaded.refDate).toEqual(REF_DATE)
  })

  it('reseeds when a module bumps its seed version, and on reset()', () => {
    const db = new DemoDatabase()
    db.init([widgetSeed(1)], { storage: localStorage, refDate: REF_DATE })
    db.collection('testWidgets').insert({
      id: 'gone',
      name: 'Gone',
      site: 'Riverton',
      status: 'new',
    })
    db.flush()

    const upgraded = new DemoDatabase()
    expect(upgraded.init([widgetSeed(2)], { storage: localStorage, refDate: REF_DATE })).toEqual({
      seeded: true,
    })
    expect(upgraded.collection('testWidgets').has('gone')).toBe(false)

    upgraded.collection('testWidgets').clear()
    upgraded.reset({ refDate: REF_DATE })
    expect(upgraded.collection('testWidgets').count()).toBe(5)
  })
})
