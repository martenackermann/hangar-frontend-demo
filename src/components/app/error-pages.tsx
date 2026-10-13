import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { CircleAlert, Compass, LockKeyhole, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { buttonVariants, Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { isApiError } from '@/lib/api/errors'
import { homePathFor, isForbiddenError } from '@/lib/auth/guards'
import { useMe } from '@/lib/auth/store'
import { useDocumentTitle } from '@/lib/use-document-title'
import { openCommandPalette } from './command-palette-store'

/** 403 rendered inside the shell (SCREENS.md §2.2). */
export function ForbiddenPage() {
  const me = useMe()
  useDocumentTitle('No access')
  return (
    <div className="grid h-full place-items-center p-6" data-testid="forbidden">
      <EmptyState
        icon={LockKeyhole}
        title="You don't have access to this screen."
        actions={
          <Link to={homePathFor(me)} className={buttonVariants({ variant: 'primary' })}>
            Go to start
          </Link>
        }
      >
        Your role ({me?.role ?? 'unknown'}) does not include it. Ask an administrator, or switch
        persona in the demo.
      </EmptyState>
    </div>
  )
}

/** 404 (SCREENS.md §2.2): "This page doesn't exist." + search. */
export function NotFoundPage() {
  const me = useMe()
  useDocumentTitle('Not found')
  return (
    <div className="grid h-full place-items-center p-6" data-testid="not-found">
      <EmptyState
        icon={Compass}
        title="This page doesn't exist."
        actions={
          <>
            <Button variant="primary" onClick={() => openCommandPalette()} shortcut="mod+k">
              Search
            </Button>
            <Link to={homePathFor(me)} className={buttonVariants({ variant: 'secondary' })}>
              Go to start
            </Link>
          </>
        }
      >
        Check the address, or search for a request, asset or serial.
      </EmptyState>
    </div>
  )
}

/** Router `defaultErrorComponent`: 403 for ForbiddenError, otherwise an inline error with Retry. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const queryErrorResetBoundary = useQueryErrorResetBoundary()
  useEffect(() => {
    queryErrorResetBoundary.reset()
  }, [queryErrorResetBoundary])

  if (isForbiddenError(error)) return <ForbiddenPage />
  const title = isApiError(error) ? error.title : 'Something went wrong'
  const detail = isApiError(error)
    ? error.detail
    : error instanceof Error
      ? error.message
      : undefined
  return (
    <div className="grid h-full place-items-center p-6" role="alert">
      <EmptyState
        icon={CircleAlert}
        title={title}
        actions={
          <Button
            icon={RefreshCw}
            onClick={() => {
              reset()
              void router.invalidate()
            }}
          >
            Retry
          </Button>
        }
      >
        {detail ?? 'The screen could not be loaded.'}
      </EmptyState>
    </div>
  )
}

export function PendingPage() {
  return (
    <div className="grid gap-2 p-6" aria-busy="true" aria-label="Loading">
      <span className="hg-skeleton block h-5 w-48" />
      <span className="hg-skeleton block h-3 w-80" />
    </div>
  )
}
