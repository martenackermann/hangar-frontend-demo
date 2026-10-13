import { CircleAlert, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState, Skeleton } from '@/components/ui/feedback'
import { isApiError } from '@/lib/api/errors'

export function DrawerLoading() {
  return (
    <div className="grid gap-3 p-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-4 w-40" />
    </div>
  )
}

export function DrawerError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <EmptyState
      icon={CircleAlert}
      title={isApiError(error) ? error.title : 'Could not load this record'}
      actions={
        <Button icon={RefreshCw} onClick={onRetry}>
          Retry
        </Button>
      }
    >
      {isApiError(error) ? error.detail : 'Check your connection and try again.'}
    </EmptyState>
  )
}
