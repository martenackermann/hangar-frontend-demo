import type { QueryClient } from '@tanstack/react-query'
import { notify } from '@/components/ui/toast'
import { api } from '@/lib/api/client'
import { isApiError } from '@/lib/api/errors'
import type { BackgroundJob, JobAccepted } from '@/lib/api/types'
import { plural } from '@/lib/format'
import { trackJob } from '@/lib/jobs'
import { DISPATCH_INVALIDATES } from './api'

function total(record: Record<string, number>): number {
  return Object.values(record).reduce((sum, n) => sum + n, 0)
}

/**
 * Queue a real dispatch run (`POST /comms/dispatch-runs {dryRun: false}` → 202) and follow its
 * job with a toast; used by the Communications header, the dry-run dialog and ⌘K.
 */
export async function startDispatch(queryClient: QueryClient): Promise<BackgroundJob | undefined> {
  let accepted: JobAccepted
  try {
    accepted = await api.post<JobAccepted>('/comms/dispatch-runs', { dryRun: false })
  } catch (error) {
    notify.error(isApiError(error) ? error.title : 'Could not start the dispatch', {
      description: isApiError(error) ? error.detail : undefined,
    })
    return undefined
  }
  return trackJob(queryClient, accepted, {
    title: 'Sending due mails',
    invalidate: [...DISPATCH_INVALIDATES],
    describe: (job) =>
      job.result?.kind === 'comms_dispatch'
        ? `${plural(total(job.result.counts), 'mail')} sent · ${plural(total(job.result.skipped), 'record')} skipped`
        : undefined,
  })
}
