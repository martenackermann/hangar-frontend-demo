import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAuth, setSession } from '@/lib/auth/store'
import { apiPath, problems } from '@/mocks/http'
import { server } from '@/mocks/node'
import { PERSONA_EMAILS, signInAs } from '@/test/utils'
import { api, setUnauthorizedHandler, toQueryString } from './client'
import { ApiError } from './errors'
import type { Me, Page, ServiceRequestDetail } from './types'

describe('api client', () => {
  afterEach(() => setUnauthorizedHandler(undefined))

  it('serializes query params as comma lists and drops empty values', () => {
    expect(
      toQueryString({
        status: ['invited', 'escalated'],
        page: 2,
        q: '',
        vip: undefined,
        paused: false,
      }),
    ).toBe('?status=invited,escalated&page=2&paused=false')
  })

  it('signs in a persona against the mock API and sends the bearer token', async () => {
    const login = await signInAs(PERSONA_EMAILS.dispatcher)
    expect(login.user.role).toBe('dispatcher')
    const me = await api.get<Me>('/me')
    expect(me.email).toBe(PERSONA_EMAILS.dispatcher)
    expect(me.permissions).toContain('sr.comms')
  })

  it('throws a normalised ApiError for problem+json responses', async () => {
    await signInAs(PERSONA_EMAILS.viewer)
    const promise = api.get('/service-requests/999999')
    await expect(promise).rejects.toBeInstanceOf(ApiError)
    await expect(promise).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      title: 'Not found',
    })
  })

  it('signs out and calls the unauthorized handler on 401', async () => {
    server.use(http.get(apiPath('/me'), () => problems.unauthenticated()))
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    setSession({
      accessToken: 'demo.1.expired',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: {
        id: 1,
        email: 'x@example.com',
        firstName: 'X',
        lastName: 'Y',
        displayName: 'X Y',
        role: 'viewer',
        permissions: [],
        homeSite: null,
        isDemoPersona: true,
      },
    })
    await expect(api.get('/me')).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).toHaveBeenCalledOnce()
    expect(getAuth().accessToken).toBeNull()
  })

  it('turns network failures into status-0 ApiErrors', async () => {
    server.use(http.get(apiPath('/sites'), () => HttpResponse.error()))
    await expect(api.get('/sites')).rejects.toMatchObject({ status: 0, isNetworkError: true })
  })

  it('answers unknown endpoints with 501 instead of hitting the network', async () => {
    await signInAs(PERSONA_EMAILS.viewer)
    await expect(api.get('/definitely-not-mocked')).rejects.toMatchObject({ status: 501 })
  })

  it('runs a workflow action and returns the updated detail', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    server.use(
      http.get(apiPath('/service-requests'), () =>
        HttpResponse.json<Page<{ id: number }>>({
          data: [],
          meta: { page: 1, perPage: 25, total: 0, totalPages: 1 },
        }),
      ),
    )
    const { db } = await import('@/mocks/db')
    const booked = db
      .collection('service_requests')
      .find((sr) => sr.status === 'appointment_booked')
    expect(booked).toBeDefined()
    const detail = await api.post<ServiceRequestDetail>(
      `/service-requests/${booked?.id}/actions/claim`,
      {},
    )
    expect(detail.status).toBe('personalization_in_progress')
    expect(detail.editor?.email).toBe(PERSONA_EMAILS.dispatcher)
    expect(detail.availableActions).toContain('release')
  })
})
