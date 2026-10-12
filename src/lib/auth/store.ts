import { createStore, useSelector } from '@tanstack/react-store'
import { hasPermission, type PermissionRequirement } from './permissions'

/**
 * Client-side session state.
 *
 * Decision: TanStack Store (zustand is not installed). It is a module singleton, so the
 * API client middleware and router `beforeLoad` guards read it outside React, while
 * components subscribe with `useSelector` / the hooks below. The session is persisted to
 * localStorage and synchronised across tabs via the `storage` event.
 *
 * PLACEHOLDER (phase 2a): the user shape is aligned with API.md in phase 2b.
 */
export interface SessionUser {
  id: string
  email: string
  name: string
  roles: string[]
  permissions: string[]
}

export interface AuthState {
  accessToken: string | null
  user: SessionUser | null
}

const STORAGE_KEY = 'hangar.auth.v1'
const EMPTY: AuthState = { accessToken: null, user: null }

function readPersisted(): AuthState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<AuthState>
    if (typeof parsed.accessToken !== 'string' || !parsed.user) return EMPTY
    return { accessToken: parsed.accessToken, user: parsed.user }
  } catch {
    return EMPTY
  }
}

function writePersisted(state: AuthState): void {
  try {
    if (state.accessToken && state.user) {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state))
    } else {
      globalThis.localStorage?.removeItem(STORAGE_KEY)
    }
  } catch {
    // Storage can be unavailable (private mode, quota); the session then lives in memory only.
  }
}

export const authStore = createStore<AuthState>(readPersisted())

authStore.subscribe((state) => writePersisted(state))

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) authStore.setState(() => readPersisted())
  })
}

// --- imperative API (router guards, API client, event handlers) ---------------------------

export function getAuth(): AuthState {
  return authStore.get()
}

export function getAccessToken(): string | null {
  return authStore.get().accessToken
}

export function isAuthenticated(): boolean {
  const { accessToken, user } = authStore.get()
  return Boolean(accessToken && user)
}

export function can(required: PermissionRequirement | undefined): boolean {
  return hasPermission(authStore.get().user?.permissions, required)
}

export function signIn(accessToken: string, user: SessionUser): void {
  authStore.setState(() => ({ accessToken, user }))
}

export function signOut(): void {
  authStore.setState(() => EMPTY)
}

// --- hooks --------------------------------------------------------------------------------

export function useAuth(): AuthState {
  return useSelector(authStore)
}

export function useCurrentUser(): SessionUser | null {
  return useSelector(authStore, (state) => state.user)
}

export function useCan(required: PermissionRequirement | undefined): boolean {
  return useSelector(authStore, (state) => hasPermission(state.user?.permissions, required))
}
