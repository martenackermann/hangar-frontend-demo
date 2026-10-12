import { describe, expect, it } from 'vitest'
import {
  applyListQuery,
  filterIn,
  listResponse,
  paginate,
  parseListParams,
  type Page,
} from './list'
import { defineMachine, SYSTEM_CONTEXT } from './transitions'

interface Ticket {
  id: string
  number: string
  status: 'open' | 'claimed' | 'done'
  site: string
  openedAt: string | null
}

const tickets: Ticket[] = [
  { id: '1', number: 'SR0000010', status: 'open', site: 'Riverton', openedAt: '2026-10-01' },
  { id: '2', number: 'SR0000002', status: 'claimed', site: 'Hillford', openedAt: '2026-10-03' },
  { id: '3', number: 'SR0000003', status: 'open', site: 'Eastgate', openedAt: null },
  { id: '4', number: 'SR0000004', status: 'done', site: 'Riverton', openedAt: '2026-10-02' },
]

const url = (query: string) => `http://localhost:8100/api/v1/tickets?${query}`

describe('mock list helpers', () => {
  it('parses paging, sorting and search with sane defaults and limits', () => {
    const params = parseListParams(url('page=2&pageSize=500&sort=-openedAt,number&q=%20sr%20'))
    expect(params).toMatchObject({
      page: 2,
      pageSize: 200,
      q: 'sr',
      sort: [
        { field: 'openedAt', direction: 'desc' },
        { field: 'number', direction: 'asc' },
      ],
    })
    expect(parseListParams(url('page=-1&pageSize=abc'))).toMatchObject({ page: 1, pageSize: 25 })
  })

  it('filters (repeated and comma separated values), searches and sorts', () => {
    const query = (q: string) =>
      applyListQuery(tickets, parseListParams(url(q)), {
        searchFields: ['number', 'site'],
        filters: { status: filterIn('status') },
      }).map((t) => t.id)

    expect(query('status=open&status=done')).toEqual(['1', '3', '4'])
    expect(query('status=open,claimed&q=river')).toEqual(['1'])
    expect(query('sort=number')).toEqual(['2', '3', '4', '1'])
    // empty values sort last in both directions
    expect(query('sort=-openedAt')).toEqual(['2', '4', '1', '3'])
    expect(query('sort=openedAt')).toEqual(['1', '4', '2', '3'])
  })

  it('paginates and builds the list response envelope', async () => {
    expect(paginate(tickets, 2, 3)).toEqual({ items: [tickets[3]], total: 4, page: 2, pageSize: 3 })

    const response = listResponse(tickets, new Request(url('pageSize=2&sort=number')), {
      map: (t) => ({ id: t.id, number: t.number }),
    })
    const body = (await response.json()) as Page<{ id: string; number: string }>
    expect(body).toEqual({
      items: [
        { id: '2', number: 'SR0000002' },
        { id: '3', number: 'SR0000003' },
      ],
      total: 4,
      page: 1,
      pageSize: 2,
    })
  })
})

describe('defineMachine', () => {
  const machine = defineMachine<Ticket, 'status'>()({
    statusKey: 'status',
    transitions: {
      claim: { from: ['open'], to: 'claimed', permission: 'staging:write' },
      complete: {
        from: ['claimed'],
        to: 'done',
        guard: (t) => (t.site === 'Hillford' ? 'Hillford is closed today.' : null),
      },
      reopen: { from: '*', to: 'open', effect: () => ({ openedAt: '2026-10-13' }) },
    },
  })
  const open = tickets[0]!
  const claimed = tickets[1]!

  it('lists the actions available for a record and user', () => {
    expect(machine.availableActions(open, SYSTEM_CONTEXT)).toEqual(['claim', 'reopen'])
    expect(machine.availableActions(open, { can: () => false })).toEqual(['reopen'])
    expect(machine.availableActions(claimed, SYSTEM_CONTEXT)).toEqual(['reopen'])
  })

  it('applies transitions or explains why not', async () => {
    expect(machine.apply(open, 'claim', SYSTEM_CONTEXT)).toEqual({
      ok: true,
      patch: { status: 'claimed' },
    })
    expect(machine.apply(claimed, 'reopen', SYSTEM_CONTEXT)).toEqual({
      ok: true,
      patch: { status: 'open', openedAt: '2026-10-13' },
    })

    const forbidden = machine.apply(open, 'claim', { can: () => false })
    expect(forbidden).toMatchObject({ ok: false, status: 403 })

    const wrongState = machine.apply(open, 'complete', SYSTEM_CONTEXT)
    expect(wrongState).toMatchObject({ ok: false, status: 409 })
    if (!wrongState.ok) {
      expect(wrongState.response.status).toBe(409)
      expect(await wrongState.response.json()).toMatchObject({
        title: 'Invalid transition',
        detail: 'Cannot complete from status "open".',
      })
    }

    expect(machine.apply(claimed, 'complete', SYSTEM_CONTEXT)).toMatchObject({
      ok: false,
      status: 409,
      detail: 'Hillford is closed today.',
    })
    expect(machine.apply(open, 'explode', SYSTEM_CONTEXT)).toMatchObject({ ok: false, status: 422 })
  })
})
