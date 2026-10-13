import { describe, expect, it } from 'vitest'
import type { Page } from '@/lib/api/types'
import {
  filterFrom,
  filterIn,
  listResponse,
  multiValue,
  paginate,
  parsePage,
  queryRows,
} from './list'

interface Ticket {
  id: number
  number: string
  status: 'open' | 'claimed' | 'done'
  site: string
  openedAt: string | null
}

const tickets: Ticket[] = [
  {
    id: 1,
    number: 'SR0000010',
    status: 'open',
    site: 'Riverton',
    openedAt: '2026-10-01T08:00:00Z',
  },
  {
    id: 2,
    number: 'SR0000002',
    status: 'claimed',
    site: 'Hillford',
    openedAt: '2026-10-03T08:00:00Z',
  },
  { id: 3, number: 'SR0000003', status: 'open', site: 'Eastgate', openedAt: null },
  {
    id: 4,
    number: 'SR0000004',
    status: 'done',
    site: 'Riverton',
    openedAt: '2026-10-02T08:00:00Z',
  },
]

const request = (query: string) => new Request(`http://localhost:8100/api/v1/tickets?${query}`)

const options = {
  sortable: { number: (t: Ticket) => t.number, openedAt: (t: Ticket) => t.openedAt },
  search: (t: Ticket, q: string) => t.site.toLowerCase().includes(q.toLowerCase()),
  filters: {
    status: filterIn((t: Ticket) => t.status),
    openedFrom: filterFrom((t: Ticket) => t.openedAt),
  },
}

function ids(query: string): number[] | Response {
  const result = queryRows(tickets, request(query), options)
  return result instanceof Response ? result : result.map((t) => t.id)
}

describe('mock list helpers (API.md §1.2–1.3)', () => {
  it('reads comma-separated and repeated multi-values', () => {
    const params = new URL(request('status=a,b&status=c').url).searchParams
    expect(multiValue(params, 'status')).toEqual(['a', 'b', 'c'])
  })

  it('filters, searches and sorts with ties broken by id', () => {
    expect(ids('status=open,done')).toEqual([1, 3, 4])
    expect(ids('status=open&q=river')).toEqual([1])
    expect(ids('sort=number')).toEqual([2, 3, 4, 1])
    expect(ids('sort=-openedAt')).toEqual([2, 4, 1, 3]) // empty values last
    expect(ids('openedFrom=2026-10-02')).toEqual([2, 4])
  })

  it('rejects unknown sort fields with 422', async () => {
    const result = ids('sort=bogus')
    expect(result).toBeInstanceOf(Response)
    const body = (await (result as Response).json()) as {
      code: string
      errors: Record<string, string[]>
    }
    expect(body.code).toBe('validation_error')
    expect(body.errors.sort?.[0]).toContain('bogus')
  })

  it('paginates into the { data, meta } envelope', async () => {
    expect(parsePage(new URL(request('page=0&perPage=500').url).searchParams)).toEqual({
      page: 1,
      perPage: 200,
    })
    expect(paginate(tickets, { page: 2, perPage: 3 })).toEqual({
      data: [tickets[3]],
      meta: { page: 2, perPage: 3, total: 4, totalPages: 2 },
    })
    expect(paginate(tickets, { page: 9, perPage: 3 }).data).toEqual([])

    const response = listResponse(tickets, request('perPage=2&sort=number'), {
      ...options,
      map: (t) => ({ id: t.id }),
    })
    const body = (await response.json()) as Page<{ id: number }>
    expect(body).toEqual({
      data: [{ id: 2 }, { id: 3 }],
      meta: { page: 1, perPage: 2, total: 4, totalPages: 2 },
    })
  })
})
