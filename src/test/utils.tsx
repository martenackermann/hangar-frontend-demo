import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EnumsProvider } from '@/lib/enums/provider'
import { setSession } from '@/lib/auth/store'
import type { LoginResponse } from '@/lib/api/types'
import { api } from '@/lib/api/client'

/** A fresh QueryClient without retries (tests). */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

/** Render with the app providers (Query + enums + Tooltip). */
export function renderWithProviders(
  ui: ReactElement,
  options?: RenderOptions & { queryClient?: QueryClient },
) {
  const queryClient = options?.queryClient ?? createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <EnumsProvider>
        <TooltipProvider>{children}</TooltipProvider>
      </EnumsProvider>
    </QueryClientProvider>
  )
  return { queryClient, ...render(ui, { wrapper, ...options }) }
}

/** Sign in a demo persona against the mock API (sets the session). */
export async function signInAs(email: string): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>('/auth/persona-login', { email })
  setSession(response)
  return response
}

export const PERSONA_EMAILS = {
  dispatcher: 'dana.dispatcher@example.com',
  technician: 'theo.technician@example.com',
  viewer: 'vic.viewer@example.com',
  admin: 'ada.admin@example.com',
} as const
