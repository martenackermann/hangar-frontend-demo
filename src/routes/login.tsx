import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { ChevronDown, CircleAlert, LogIn } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Logo } from '@/components/app/logo'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { Field, Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { coreQueries } from '@/lib/api/core'
import { isApiError } from '@/lib/api/errors'
import type { LoginResponse, Persona } from '@/lib/api/types'
import { homePathFor, safeRedirectTarget } from '@/lib/auth/guards'
import { login, personaLogin } from '@/lib/auth/session'
import { getMe, isAuthenticated } from '@/lib/auth/store'
import { stringParam } from '@/lib/search/params'
import { useShortcut } from '@/lib/shortcuts'
import { useDocumentTitle } from '@/lib/use-document-title'
import { cn } from '@/lib/utils'

/** Sign in (SCREENS.md §2.1): demo persona cards (keys 1–4) + email/password form. */
export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: stringParam() }),
  beforeLoad: ({ search }) => {
    if (isAuthenticated()) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect
      throw redirect({ href: safeRedirectTarget(search.redirect) ?? homePathFor(getMe()) })
    }
  },
  staticData: { title: 'Sign in' },
  component: LoginPage,
})

const formSchema = z.object({
  email: z.email('Enter an email address.'),
  password: z.string().min(1, 'Enter your password.'),
})
type FormValues = z.infer<typeof formSchema>

function errorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === 'account_inactive') return 'This account is deactivated.'
    if (error.status === 401) return 'Email or password is incorrect.'
    return error.detail ?? error.title
  }
  return 'Sign-in failed. Check your connection and try again.'
}

function LoginPage() {
  useDocumentTitle('Sign in')
  const router = useRouter()
  const queryClient = useQueryClient()
  const search = Route.useSearch()
  const config = useQuery(coreQueries.config()).data
  const demo = config?.demoMode ?? false
  const personas = useQuery({ ...coreQueries.personas(), enabled: demo }).data?.data ?? []
  const primary = personas.filter((p) => p.group === 'primary')
  const more = personas.filter((p) => p.group === 'more_technicians')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [showMore, setShowMore] = useState(false)

  const done = (response: LoginResponse) => {
    router.history.push(safeRedirectTarget(search.redirect) ?? homePathFor(response.user))
  }

  const signInAs = async (persona: Persona) => {
    setError(null)
    setPending(persona.email)
    try {
      done(await personaLogin(queryClient, persona.email))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setPending(null)
    }
  }

  useShortcut(
    ['1', '2', '3', '4'],
    (event) => {
      const persona = primary[Number(event.key) - 1]
      if (persona) void signInAs(persona)
    },
    { enabled: demo && primary.length > 0, description: 'Sign in as persona 1–4', group: 'Page' },
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  })
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    try {
      done(await login(queryClient, values.email, values.password))
    } catch (cause) {
      setError(errorMessage(cause))
    }
  })

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="grid w-full max-w-[720px] gap-6">
        <header className="flex items-center gap-3">
          <Logo size={36} />
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.012em]">Hangar</h1>
            <p className="text-sm text-fg-3">
              Rollout &amp; logistics console · Acme IT Services for Globex Fleet AG
            </p>
          </div>
        </header>

        {error && (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-sm border border-[color-mix(in_srgb,var(--hg-tone-critical)_35%,transparent)] bg-tone-critical-wash px-3 py-2 text-sm text-tone-critical-fg"
          >
            <Icon icon={CircleAlert} /> {error}
          </p>
        )}

        {demo && primary.length > 0 && (
          <section aria-labelledby="personas-title" className="grid gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="personas-title" className="text-md font-semibold">
                Sign in as a demo persona
              </h2>
              <span className="text-xs text-fg-3">
                Keys <Kbd>1</Kbd>–<Kbd>4</Kbd>
              </span>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {primary.map((persona, index) => (
                <li key={persona.email}>
                  <button
                    type="button"
                    onClick={() => void signInAs(persona)}
                    disabled={pending !== null}
                    aria-label={`Sign in as ${persona.displayName}, ${persona.roleLabel}`}
                    className={cn(
                      'grid h-full w-full grid-cols-[auto_1fr_auto] items-start gap-3 rounded-sm border border-line bg-surface p-3 text-left transition-colors',
                      'hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-70',
                    )}
                  >
                    <Avatar name={persona.displayName} initials={persona.initials} size={40} />
                    <span className="grid gap-1">
                      <span className="flex items-center gap-2">
                        <b className="font-semibold">{persona.displayName}</b>
                        <span className="rounded-2xs bg-pressed px-1 text-2xs font-semibold text-fg-2">
                          {persona.roleLabel}
                        </span>
                      </span>
                      <span className="text-xs text-fg-2">{persona.description}</span>
                      <span className="mt-1 text-xs font-medium text-accent-text">
                        {pending === persona.email
                          ? 'Signing in…'
                          : `Sign in as ${persona.displayName.split(' ')[0]}`}
                      </span>
                    </span>
                    <Kbd>{String(index + 1)}</Kbd>
                  </button>
                </li>
              ))}
            </ul>
            {more.length > 0 && (
              <div className="grid gap-2">
                <button
                  type="button"
                  aria-expanded={showMore}
                  onClick={() => setShowMore((v) => !v)}
                  className="inline-flex items-center gap-1 justify-self-start rounded-sm text-sm text-fg-2 hover:text-fg"
                >
                  <Icon
                    icon={ChevronDown}
                    size={14}
                    className={cn('transition-transform', showMore && 'rotate-180')}
                  />
                  More technicians
                </button>
                {showMore && (
                  <ul className="flex flex-wrap gap-2">
                    {more.map((persona) => (
                      <li key={persona.email}>
                        <Button
                          onClick={() => void signInAs(persona)}
                          loading={pending === persona.email}
                          title={persona.description}
                        >
                          {persona.displayName}
                          {persona.homeSite ? (
                            <span className="text-fg-3">· {persona.homeSite.name}</span>
                          ) : null}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        <section
          aria-labelledby="form-title"
          className="grid gap-3 rounded-sm border border-line bg-surface p-4"
        >
          <h2 id="form-title" className="text-md font-semibold">
            Sign in with email
          </h2>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
            onSubmit={(event) => void onSubmit(event)}
            noValidate
          >
            <Field label="Email" error={form.formState.errors.email?.message}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="email"
                  autoComplete="username"
                  aria-describedby={describedBy}
                  invalid={invalid}
                  {...form.register('email')}
                />
              )}
            </Field>
            <Field
              label="Password"
              error={form.formState.errors.password?.message}
              help={demo ? 'Demo password: demo1234' : undefined}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  aria-describedby={describedBy}
                  invalid={invalid}
                  {...form.register('password')}
                />
              )}
            </Field>
            {/* label-height spacer keeps the button on the inputs' baseline, whatever help/errors follow */}
            <div className="grid gap-1">
              <span aria-hidden className="text-xs max-sm:hidden">
                &nbsp;
              </span>
              <Button
                type="submit"
                variant={demo ? 'secondary' : 'primary'}
                icon={LogIn}
                loading={form.formState.isSubmitting}
              >
                Sign in
              </Button>
            </div>
          </form>
        </section>
        {demo && (
          <p className="text-center text-xs text-fg-3">
            Demo data, fake integrations. Reset personas and data from ⌘K › Reset demo data.
          </p>
        )}
      </div>
    </main>
  )
}
