import { http, HttpResponse, type RequestHandler } from 'msw'
import type { Role, UserCreate, UserPatch } from '@/lib/api/types'
import { authed } from '@/mocks/auth'
import type { UserRow } from '@/mocks/core/tables'
import { userSummary } from '@/mocks/core/read-models'
import { db } from '@/mocks/db'
import { apiPath, noContent, problem, problems, readJson } from '@/mocks/http'

/** User administration writes (API.md §5.5); `GET /users` is core. */
const ROLES: Role[] = ['viewer', 'technician', 'dispatcher', 'admin']

export const userHandlers: RequestHandler[] = [
  http.get(
    apiPath('/users/:id'),
    authed<{ id: string }>('users.manage', ({ params, request }) => {
      const row = db.collection('users').get(Number(params.id))
      return row ? HttpResponse.json(userSummary(row)) : problems.notFound('User', params.id, request)
    }),
  ),
  http.post(
    apiPath('/users'),
    authed('users.manage', async ({ request }) => {
      const body = await readJson<UserCreate>(request)
      const errors: Record<string, string[]> = {}
      const email = (body.email ?? '').trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,63}$/.test(email)) errors.email = ['Enter a valid email address.']
      if (!body.firstName?.trim()) errors.firstName = ['Field required']
      if (!body.lastName?.trim()) errors.lastName = ['Field required']
      if (!ROLES.includes(body.role as Role)) errors.role = ['Field required']
      if ((body.password ?? '').length < 8) {
        errors.password = ['String should have at least 8 characters']
      }
      if (body.homeSiteId != null && !db.collection('sites').get(body.homeSiteId)) {
        errors.homeSiteId = ['Unknown site.']
      }
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      if (db.collection('users').find((u) => u.email.toLowerCase() === email)) {
        return problem(409, 'duplicate', 'Already exists', {
          detail: 'A user with this email already exists.',
          errors: { email: ['A user with this email already exists.'] },
          request,
        })
      }
      const now = new Date().toISOString()
      const row = db.collection('users').insert({
        email,
        firstName: body.firstName!.trim(),
        lastName: body.lastName!.trim(),
        role: body.role!,
        homeSiteId: body.homeSiteId ?? null,
        isActive: true,
        isDemoPersona: false,
        personaOrder: null,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      } as Omit<UserRow, 'id'>)
      return HttpResponse.json(userSummary(row), { status: 201 })
    }),
  ),
  http.patch(
    apiPath('/users/:id'),
    authed<{ id: string }>('users.manage', async ({ params, request, actor }) => {
      const row = db.collection('users').get(Number(params.id))
      if (!row) return problems.notFound('User', params.id, request)
      const body = await readJson<UserPatch>(request)
      const errors: Record<string, string[]> = {}
      for (const key of Object.keys(body)) {
        if (!['firstName', 'lastName', 'role', 'homeSiteId'].includes(key)) {
          errors[key] = ['Unknown field.']
        }
      }
      for (const key of ['firstName', 'lastName', 'role'] as const) {
        if (key in body && !String(body[key] ?? '').trim()) errors[key] = ['This field cannot be empty.']
      }
      if (body.homeSiteId != null && !db.collection('sites').get(body.homeSiteId)) {
        errors.homeSiteId = ['Unknown site.']
      }
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      if (body.role && body.role !== row.role) {
        if (row.id === actor.id) return problems.conflict('You cannot change your own role.', request)
        if (row.isDemoPersona) {
          return problems.conflict(
            'Demo personas keep their role so the demo stories stay intact.',
            request,
          )
        }
      }
      const updated = db.collection('users').update(row.id, {
        ...(body.firstName ? { firstName: body.firstName.trim() } : {}),
        ...(body.lastName ? { lastName: body.lastName.trim() } : {}),
        ...(body.role ? { role: body.role } : {}),
        ...('homeSiteId' in body ? { homeSiteId: body.homeSiteId ?? null } : {}),
      })!
      return HttpResponse.json(userSummary(updated))
    }),
  ),
  http.post(
    apiPath('/users/:id/actions/reset_password'),
    authed<{ id: string }>('users.manage', async ({ params, request }) => {
      const row = db.collection('users').get(Number(params.id))
      if (!row) return problems.notFound('User', params.id, request)
      const body = await readJson<{ newPassword: string }>(request)
      if ((body.newPassword ?? '').length < 8) {
        return problems.validation(
          { newPassword: ['String should have at least 8 characters'] },
          undefined,
          request,
        )
      }
      if (row.isDemoPersona) {
        return problems.conflict(
          'Demo personas always use the demo password; it cannot be changed.',
          request,
        )
      }
      return noContent()
    }),
  ),
  http.post(
    apiPath('/users/:id/actions/:action'),
    authed<{ id: string; action: string }>('users.manage', ({ params, request, actor }) => {
      const row = db.collection('users').get(Number(params.id))
      if (!row) return problems.notFound('User', params.id, request)
      if (params.action !== 'activate' && params.action !== 'deactivate') {
        return problems.validation(
          { action: ["Input should be 'activate' or 'deactivate'"] },
          undefined,
          request,
        )
      }
      if (params.action === 'deactivate' && row.id === actor.id) {
        return problems.conflict('You cannot deactivate your own account.', request)
      }
      const updated = db.collection('users').update(row.id, {
        isActive: params.action === 'activate',
      })!
      return HttpResponse.json(userSummary(updated))
    }),
  ),
]
