import { beforeEach, describe, expect, it } from 'vitest'
import {
  DB_STORAGE_KEY,
  DemoDatabase,
  shiftDates,
  weekShiftDays,
  type FixtureLike,
  type SeedDefinition,
} from './db'

interface Widget {
  id: number
  name: string
  site: string
  status: 'new' | 'done'
  dueOn: string
  createdAt: string
}

function fixture(): FixtureLike {
  return {
    meta: { version: 1, generatedAt: '2026-10-13T05:50:00Z', anchorDate: '2026-10-13' },
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

  it('runs slice seeds, persists, and reloads when the manifest matches', () => {
    const db = new DemoDatabase()
    expect(
      db.init({ fixture: fixture(), seeds: [seed(1)], storage: localStorage, today: '2026-10-13' }),
    ).toEqual({ seeded: true })
    expect(db.table('gadgets').count()).toBe(1)
    db.table<Widget>('widgets').update(2, { name: 'Changed' })
    db.flush()
    expect(localStorage.getItem(DB_STORAGE_KEY)).toContain('Changed')

    const reloaded = new DemoDatabase()
    expect(reloaded.init({ fixture: fixture(), seeds: [seed(1)], storage: localStorage })).toEqual({
      seeded: false,
    })
    expect(reloaded.table<Widget>('widgets').get(2)?.name).toBe('Changed')
  })

  it('reseeds when a seed version changes, and on reset()', () => {
    const db = new DemoDatabase()
    db.init({ fixture: fixture(), seeds: [seed(1)], storage: localStorage, today: '2026-10-13' })
    db.table<Widget>('widgets').update(2, { name: 'Changed' })
    db.flush()

    const upgraded = new DemoDatabase()
    expect(
      upgraded.init({
        fixture: fixture(),
        seeds: [seed(2)],
        storage: localStorage,
        today: '2026-10-13',
      }),
    ).toEqual({ seeded: true })
    expect(upgraded.table<Widget>('widgets').get(2)?.name).toBe('Arm')

    upgraded.table<Widget>('widgets').clear()
    upgraded.reset({ today: '2026-10-13' })
    expect(upgraded.table('widgets').count()).toBe(2)
  })
})
