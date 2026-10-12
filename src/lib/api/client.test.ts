import { http, HttpResponse } from 'msw'
import type { Client } from 'openapi-fetch'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAuth, signIn } from '@/lib/auth/store'
import { apiPath, problems } from '@/mocks/http'
import { server } from '@/mocks/node'
import { api, setUnauthorizedHandler, unwrap } from './client'
import { ApiError } from './errors'

/** The generated schema is still a placeholder, so type the client for a test endpoint. */
interface TestPaths {
  '/things/{id}': {
    parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
    get: {
      parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
      requestBody?: never
      responses: {
        200: {
          headers: Record<string, unknown>
          content: { 'application/json': { id: string; seenAuth: string | null } }
        }
        404: { headers: Record<string, unknown>; content: { 'application/problem+json': unknown } }
      }
    }
  }
}
const client = api as unknown as Client<TestPaths>

const user = {
  id: 'u1',
  email: 'dana.dispatcher@example.com',
  name: 'Dana Dispatcher',
  roles: ['dispatcher'],
  permissions: ['requests:read'],
}

describe('api client', () => {
  afterEach(() => setUnauthorizedHandler(undefined))

  it('sends the bearer token and returns data via unwrap()', async () => {
    server.use(
      http.get(apiPath('/things/:id'), ({ params, request }) =>
        HttpResponse.json({
          id: String(params.id),
          seenAuth: request.headers.get('Authorization'),
        }),
      ),
    )
    signIn('abc123', user)

    const thing = await unwrap(client.GET('/things/{id}', { params: { path: { id: '7' } } }))

    expect(thing).toEqual({ id: '7', seenAuth: 'Bearer abc123' })
  })

  it('throws a normalised ApiError for problem+json responses', async () => {
    server.use(http.get(apiPath('/things/:id'), () => problems.notFound('Thing', 9)))

    const promise = unwrap(client.GET('/things/{id}', { params: { path: { id: '9' } } }))

    await expect(promise).rejects.toBeInstanceOf(ApiError)
    await expect(promise).rejects.toMatchObject({
      status: 404,
      title: 'Not found',
      detail: 'Thing 9 not found.',
    })
  })

  it('signs out and calls the unauthorized handler on 401', async () => {
    server.use(http.get(apiPath('/things/:id'), () => problems.unauthorized()))
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    signIn('expired', user)

    await expect(
      unwrap(client.GET('/things/{id}', { params: { path: { id: '1' } } })),
    ).rejects.toMatchObject({ status: 401 })

    expect(onUnauthorized).toHaveBeenCalledOnce()
    expect(getAuth()).toEqual({ accessToken: null, user: null })
  })

  it('turns network failures into status-0 ApiErrors', async () => {
    server.use(http.get(apiPath('/things/:id'), () => HttpResponse.error()))

    await expect(
      unwrap(client.GET('/things/{id}', { params: { path: { id: '1' } } })),
    ).rejects.toMatchObject({ status: 0, isNetworkError: true })
  })

  it('answers unknown endpoints with 501 instead of hitting the network', async () => {
    const response = await fetch(apiPath('/definitely-not-mocked'))
    expect(response.status).toBe(501)
    expect(response.headers.get('Content-Type')).toContain('application/problem+json')
  })
})
