import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { useEffect, type ReactNode } from 'react'
import { isApiError } from '@/lib/api/errors'
import { isForbiddenError } from '@/lib/auth/guards'

/**
 * Default route error component (router `defaultErrorComponent`).
 * PLACEHOLDER styling (phase 2a); phase 2b restyles it with the UI kit.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const queryErrorResetBoundary = useQueryErrorResetBoundary()

  useEffect(() => {
    queryErrorResetBoundary.reset()
  }, [queryErrorResetBoundary])

  if (isForbiddenError(error)) {
    return (
      <ErrorPanel
        title="No access"
        detail="Your role does not include this area. Ask an administrator if you need it."
      />
    )
  }

  const title = isApiError(error) ? error.title : 'Something went wrong'
  const detail = isApiError(error)
    ? error.detail
    : error instanceof Error
      ? error.message
      : undefined

  return (
    <ErrorPanel title={title} detail={detail}>
      <button
        type="button"
        className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        onClick={() => {
          reset()
          void router.invalidate()
        }}
      >
        Try again
      </button>
    </ErrorPanel>
  )
}

export function NotFound() {
  return <ErrorPanel title="Page not found" detail="This address does not exist (any more)." />
}

function ErrorPanel({
  title,
  detail,
  children,
}: {
  title: string
  detail?: string | undefined
  children?: ReactNode
}) {
  return (
    <div role="alert" className="mx-auto flex max-w-lg flex-col items-start gap-3 p-8">
      <h1 className="text-lg font-semibold">{title}</h1>
      {detail && <p className="text-sm text-slate-600">{detail}</p>}
      <div className="flex gap-2">
        {children}
        <Link
          to="/"
          className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Go to start page
        </Link>
      </div>
    </div>
  )
}

export function PendingPage() {
  return (
    <div className="p-8 text-sm text-slate-500" aria-busy="true">
      Loading…
    </div>
  )
}
