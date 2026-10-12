import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { ALL_PERMISSIONS } from '@/lib/auth/permissions'
import { safeRedirectTarget } from '@/lib/auth/guards'
import { isAuthenticated, signIn } from '@/lib/auth/store'

const loginSearchSchema = z.object({
  /** Where to go after signing in (same-origin path, validated on use). */
  redirect: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  staticData: { layout: 'bare', title: 'Sign in' },
  beforeLoad: ({ search }) => {
    if (isAuthenticated()) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect
      throw redirect({ href: safeRedirectTarget(search.redirect) })
    }
  },
  component: LoginPage,
})

/** PLACEHOLDER session (phase 2a only): phase 2b implements the real sign-in per API.md. */
const PLACEHOLDER_SESSION = 'placeholder-session'

function LoginPage() {
  const router = useRouter()
  const search = Route.useSearch()

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Hangar</h1>
      <p className="text-sm text-slate-600">
        Rollout &amp; logistics console. Sign-in arrives in phase 2b.
      </p>
      <button
        type="button"
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        onClick={() => {
          signIn(PLACEHOLDER_SESSION, {
            id: 'placeholder-admin',
            email: 'demo.admin@example.com',
            name: 'Demo Admin',
            roles: ['admin'],
            permissions: [ALL_PERMISSIONS],
          })
          router.history.push(safeRedirectTarget(search.redirect))
        }}
      >
        Continue as demo admin
      </button>
    </main>
  )
}
