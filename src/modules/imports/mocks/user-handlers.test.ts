import { describe, expect, it } from 'vitest'
import { api } from '@/lib/api/client'
import { isApiError } from '@/lib/api/errors'
import type { UserSummary } from '@/lib/api/types'
import { db } from '@/mocks/db'
import { PERSONA_EMAILS, signInAs } from '@/test/utils'

/** H2 user administration in demo mode: personas can't be locked out (backend `users.py`). */

async function failure(call: Promise<unknown>) {
  try {
    await call
  } catch (error) {
    if (isApiError(error)) return error
    throw error
  }
  throw new Error('expected the call to fail')
}

describe('user activation', () => {
  it('refuses to deactivate a demo persona with a 409', async () => {
    await signInAs(PERSONA_EMAILS.admin)
    const dana = db.collection('users').find((u) => u.email === PERSONA_EMAILS.dispatcher)!
    expect(dana.isDemoPersona).toBe(true)
    const error = await failure(api.post(`/users/${dana.id}/actions/deactivate`, {}))
    expect(error.status).toBe(409)
    expect(error.detail).toMatch(/Demo personas stay active/)
    expect(db.collection('users').get(dana.id)?.isActive).toBe(true)
  })

  it('still deactivates and reactivates other accounts', async () => {
    await signInAs(PERSONA_EMAILS.admin)
    const created = await api.post<UserSummary>('/users', {
      email: 'greta.holm@example.com',
      firstName: 'Greta',
      lastName: 'Holm',
      role: 'viewer',
      password: 'demo-pass-123',
    })
    const off = await api.post<UserSummary>(`/users/${created.id}/actions/deactivate`, {})
    expect(off.isActive).toBe(false)
    const on = await api.post<UserSummary>(`/users/${created.id}/actions/activate`, {})
    expect(on.isActive).toBe(true)
  })
})
