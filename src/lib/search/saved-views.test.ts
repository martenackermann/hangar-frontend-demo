import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import {
  boolParam,
  idListParam,
  listParam,
  listSearchSchema,
  parseSearch,
  stringifySearch,
} from './params'
import {
  canonicalViewSearch,
  encodeViewSearch,
  parseViewId,
  searchForView,
  viewSearchEquals,
} from './saved-views'

const schema = listSearchSchema.extend({
  status: listParam(['invited', 'escalated', 'imported']),
  regionId: idListParam({ allowNone: true }),
  vip: boolParam(),
})

describe('URL search codec (SCREENS.md §0, SPEC_RESOLUTIONS #39)', () => {
  it('writes comma lists, booleans and numbers; drops empty values', () => {
    expect(
      stringifySearch({
        status: ['invited', 'escalated'],
        page: 2,
        vip: false,
        q: '',
        sr: undefined,
        empty: [],
      }),
    ).toBe('?status=invited,escalated&page=2&vip=false')
    expect(stringifySearch({ q: 'Müller & Co' })).toBe('?q=M%C3%BCller%20%26%20Co')
  })

  it('parses raw strings and joins repeated keys into the canonical list', () => {
    expect(parseSearch('?status=invited&status=escalated&regionId[]=4&page=2')).toEqual({
      status: 'invited,escalated',
      regionId: '4',
      page: '2',
    })
  })

  it('round-trips through the zod helpers (invalid entries dropped, defaults applied)', () => {
    const parsed = schema.parse(
      parseSearch('?status=invited,bogus,escalated&regionId=1,none,x&vip=true&page=0'),
    )
    expect(parsed).toMatchObject({
      status: ['invited', 'escalated'],
      regionId: [1, 'none'],
      vip: true,
      page: 1,
      perPage: 25,
    })
    expect(schema.parse(parseSearch(stringifySearch(parsed)))).toEqual(parsed)
    expect(z.object({ x: idListParam() }).parse({ x: 'none' })).toEqual({ x: undefined })
  })
})

describe('saved-view codec', () => {
  const defaults = { page: 1, perPage: 25 }

  it('canonicalises: drops volatile keys, empties and defaults; sorts arrays and keys', () => {
    expect(
      canonicalViewSearch(
        {
          status: ['escalated', 'invited'],
          page: 3,
          perPage: 25,
          sr: 42,
          tab: 'items',
          view: 'builtin:open',
          q: '',
          regionId: [4, 1],
        },
        defaults,
      ),
    ).toEqual({ regionId: [1, 4], status: ['escalated', 'invited'] })
  })

  it('detects a modified view regardless of order and paging', () => {
    const view = { status: ['invited', 'escalated'], sort: '-importedAt' }
    expect(
      viewSearchEquals(
        view,
        { sort: '-importedAt', status: ['escalated', 'invited'], page: 4, sr: 7 },
        defaults,
      ),
    ).toBe(true)
    expect(viewSearchEquals(view, { status: ['invited'], sort: '-importedAt' }, defaults)).toBe(
      false,
    )
  })

  it('encodes the view for links/status bar and builds the search for a view', () => {
    expect(encodeViewSearch({ status: ['invited'], page: 2 }, defaults)).toBe('?status=invited')
    expect(searchForView('saved:12', { stage: ['booked'], page: 3 })).toEqual({
      stage: ['booked'],
      view: 'saved:12',
    })
    expect(parseViewId('builtin:open')).toEqual({ kind: 'builtin', key: 'open' })
    expect(parseViewId('saved:12')).toEqual({ kind: 'saved', id: 12 })
    expect(parseViewId('saved:x')).toBeUndefined()
  })
})
