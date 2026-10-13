import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { notify } from '@/components/ui/toast'
import { api } from '@/lib/api/client'
import { coreKeys } from '@/lib/api/core'
import { isApiError } from '@/lib/api/errors'
import type { BackgroundJob, JobAccepted } from '@/lib/api/types'

/**
 * Long-running jobs (API.md §1.7, SCREENS.md §0 "Jobs"): `202 JobAccepted` → a "job toast"
 * that polls `GET /jobs/{id}` every second, then shows the success/failure summary and
 * invalidates the given queries. Keeps running across navigation.
 *
 *   const accepted = await api.post<JobAccepted>('/appointments/sync', {})
 *   trackJob(queryClient, accepted, { title: 'Appointment sync', invalidate: [['appointments']] })
 */
export interface TrackJobOptions {
  /** "Appointment sync", "Import service_requests.csv" */
  title: string
  invalidate?: readonly QueryKey[]
  /** Summary line for the success toast. */
  describe?: (job: BackgroundJob) => string | undefined
  onDone?: (job: BackgroundJob) => void
}

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled'])

export function trackJob(
  queryClient: QueryClient,
  accepted: Pick<JobAccepted, 'jobId'>,
  options: TrackJobOptions,
): Promise<BackgroundJob | undefined> {
  const toastId = `job-${accepted.jobId}`
  notify.loading(options.title, { id: toastId, description: 'Queued…' })
  void queryClient.invalidateQueries({ queryKey: coreKeys.runningJobs })

  return new Promise((resolve) => {
    const poll = async () => {
      try {
        const job = await queryClient.fetchQuery({
          queryKey: coreKeys.job(accepted.jobId),
          queryFn: ({ signal }) => api.get<BackgroundJob>(`/jobs/${accepted.jobId}`, { signal }),
          staleTime: 0,
        })
        if (!TERMINAL.has(job.status)) {
          const percent = job.progress.percent
          notify.loading(options.title, {
            id: toastId,
            description:
              job.message ??
              (percent !== null
                ? `${Math.round(percent)} %`
                : job.status === 'queued'
                  ? 'Queued…'
                  : 'Running…'),
          })
          window.setTimeout(() => void poll(), 1000)
          return
        }
        await Promise.all(
          (options.invalidate ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        )
        void queryClient.invalidateQueries({ queryKey: coreKeys.runningJobs })
        if (job.status === 'succeeded') {
          notify.success(`${options.title} finished`, {
            id: toastId,
            description: options.describe?.(job) ?? job.message ?? undefined,
          })
        } else if (job.status === 'cancelled') {
          notify.warning(`${options.title} cancelled`, { id: toastId })
        } else {
          notify.error(`${options.title} failed`, {
            id: toastId,
            description: job.error ?? job.message ?? undefined,
          })
        }
        options.onDone?.(job)
        resolve(job)
      } catch (error) {
        notify.error(`${options.title}: status unknown`, {
          id: toastId,
          description: isApiError(error)
            ? (error.detail ?? error.title)
            : 'Lost contact with the job.',
        })
        resolve(undefined)
      }
    }
    window.setTimeout(() => void poll(), 600)
  })
}
