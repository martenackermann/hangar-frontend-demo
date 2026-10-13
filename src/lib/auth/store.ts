import { createStore, useSelector } from '@tanstack/react-store'
import type { LoginResponse, Me } from '@/lib/api/types'
import { hasPermission, type PermissionRequirement } from './permissions'

/**
 * Client-side session (SCREENS.md §2.1). TanStack Store singleton (zustand is not installed):
 * the API client and router guards read it outside React, components subscribe with hooks.
 *
 * - The bearer token lives in localStorage `hangar.token` (as specified).
 * - The last `GET /me` (permissions!) is cached in `hangar.session.v1` so the shell renders
 *   immediately on reload; the `_app` route refreshes it on every app load.
 * - Synced across tabs via the `storage` event.
 */
export interface AuthState {
  accessToken: string | null
  expiresAt: string | null
  me: Me | null
}

export const TOKEN_STORAGE_KEY = 'hangar.token'
export const SESSION_STORAGE_KEY = 'hangar.session.v1'
const EMPTY: AuthState = { accessToken: null, expiresAt: null, me: null }
const NO_PERMISSIONS: readonly string[] = []

function readPersisted(): AuthState {
  try {
    const accessToken = globalThis.localStorage?.getItem(TOKEN_STORAGE_KEY) ?? null
    if (!accessToken) return EMPTY
    const raw = globalThis.localStorage?.getItem(SESSION_STORAGE_KEY)
    const session = raw ? (JSON.parse(raw) as Partial<AuthState>) : {}
    return { accessToken, expiresAt: session.expiresAt ?? null, me: session.me ?? null }
  } catch {
    return EMPTY
  }
}

function writePersisted(state: AuthState): void {
  try {
    if (state.accessToken) {
      globalThis.localStorage?.setItem(TOKEN_STORAGE_KEY, state.accessToken)
      globalThis.localStorage?.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ expiresAt: state.expiresAt, me: state.me }),
      )
    } else {
      globalThis.localStorage?.removeItem(TOKEN_STORAGE_KEY)
      globalThis.localStorage?.removeItem(SESSION_STORAGE_KEY)
    }
  } catch {
    // Storage unavailable (private mode, quota): the session lives in memory only.
  }
}

export const authStore = createStore<AuthState>(readPersisted())

authStore.subscribe((state) => writePersisted(state))

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === TOKEN_STORAGE_KEY || event.key === SESSION_STORAGE_KEY) {
      authStore.setState(() => readPersisted())
    }
  })
}

// --- imperative API -----------------------------------------------------------------------

export function getAuth(): AuthState {
  return authStore.get()
}

export function getAccessToken(): string | null {
  return authStore.get().accessToken
}

export function getMe(): Me | null {
  return authStore.get().me
}

export function isAuthenticated(): boolean {
  const { accessToken, expiresAt } = authStore.get()
  if (!accessToken) return false
  return !expiresAt || Date.parse(expiresAt) > Date.now()
}

export function can(required: PermissionRequirement | undefined): boolean {
  return hasPermission(authStore.get().me?.permissions, required)
}

export function setSession(response: LoginResponse): void {
  authStore.setState(() => ({
    accessToken: response.accessToken,
    expiresAt: response.expiresAt,
    me: response.user,
  }))
}

export function setMe(me: Me): void {
  authStore.setState((prev) => ({ ...prev, me }))
}

export function signOut(): void {
  authStore.setState(() => EMPTY)
}

// --- hooks --------------------------------------------------------------------------------

export function useAuth(): AuthState {
  return useSelector(authStore)
}

export function useMe(): Me | null {
  return useSelector(authStore, (state) => state.me)
}

export function useCan(required: PermissionRequirement | undefined): boolean {
  return useSelector(authStore, (state) => hasPermission(state.me?.permissions, required))
}

export function usePermissions(): readonly string[] {
  return useSelector(authStore, (state) => state.me?.permissions ?? NO_PERMISSIONS)
}
