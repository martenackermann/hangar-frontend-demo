import type { QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { coreKeys } from '@/lib/api/core'
import type { LoginResponse } from '@/lib/api/types'
import { setSession, signOut } from './store'

/**
 * Session actions (API.md §3.1). After every identity change the query cache is cleared so no
 * data of the previous user/role survives (persona switching reloads data under the new role).
 */
export async function login(
  queryClient: QueryClient,
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>('/auth/login', { email, password })
  startSession(queryClient, response)
  return response
}

export async function personaLogin(
  queryClient: QueryClient,
  email: string,
): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>('/auth/persona-login', { email })
  startSession(queryClient, response)
  return response
}

function startSession(queryClient: QueryClient, response: LoginResponse): void {
  queryClient.clear()
  setSession(response)
  queryClient.setQueryData(coreKeys.me, response.user)
}

export async function logout(queryClient: QueryClient): Promise<void> {
  try {
    await api.post('/auth/logout', {})
  } catch {
    // stateless: discarding the token is enough
  }
  signOut()
  queryClient.clear()
}
