import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MailCheck, Send } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useDrawerNavigation } from '@/components/drawer/drawer-state'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Banner, EmptyState, SkeletonRows } from '@/components/ui/feedback'
import { notify } from '@/components/ui/toast'
import { isApiError } from '@/lib/api/errors'
import type { DispatchRun } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { formatNumber, plural } from '@/lib/format'
import { trackJob } from '@/lib/jobs'
import { DISPATCH_INVALIDATES, templatesQuery, useDryRun, useRunDispatch } from '../api'
import { skipLabel } from './labels'

/**
 * "Send due mails" (DESIGN.md §11.1, SCREENS.md §4.3 Dispatch runs): opens with a dry run of
 * the daily dispatch (stored with `dryRun: true`, SPEC_RESOLUTIONS #10) — mails grouped by
 * template, skipped reasons — then "Send now" queues the real run and tracks its job.
 */
export function useTemplateNames(): (id: string) => string {
  const { data } = useQuery(templatesQuery)
  return useMemo(() => {
    const names = new Map((data?.data ?? []).map((t) => [t.id, t.name]))
    return (id: string) => names.get(id) ?? id
  }, [data])
}

export function useStartDispatch() {
  const queryClient = useQueryClient()
  const run = useRunDispatch()
  return {
    pending: run.isPending,
    start: () =>
      run.mutateAsync().then(
        (accepted) =>
          trackJob(queryClient, accepted, {
            title: 'Sending due mails',
            invalidate: [...DISPATCH_INVALIDATES],
            describe: (job) =>
              job.result?.kind === 'comms_dispatch'
                ? `${plural(
                    Object.values(job.result.counts).reduce((sum, n) => sum + n, 0),
                    'mail',
                  )} sent · ${plural(
                    Object.values(job.result.skipped).reduce((sum, n) => sum + n, 0),
                    'record',
                  )} skipped`
                : undefined,
          }),
        (error: unknown) => {
          notify.error(isApiError(error) ? error.title : 'Could not start the dispatch', {
            description: isApiError(error) ? error.detail : undefined,
          })
        },
      ),
  }
}

export function DispatchSummary({ run }: { run: DispatchRun }) {
  const templateName = useTemplateNames()
  const drawer = useDrawerNavigation()
  const total = Object.values(run.counts).reduce((sum, n) => sum + n, 0)
  const groups = useMemo(() => {
    const byTemplate = new Map<string, NonNullable<DispatchRun['planned']>>()
    for (const mail of run.planned ?? []) {
      byTemplate.set(mail.templateId, [...(byTemplate.get(mail.templateId) ?? []), mail])
    }
    return [...byTemplate.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [run.planned])
  const skipped = Object.entries(run.skipped).filter(([, n]) => n > 0)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div>
          <div className="text-xs text-fg-3">Mails</div>
          <div className="text-2xl font-semibold [font-stretch:87.5%]">{formatNumber(total)}</div>
        </div>
        <div>
          <div className="text-xs text-fg-3">Skipped</div>
          <div className="text-2xl font-semibold [font-stretch:87.5%]">
            {formatNumber(skipped.reduce((sum, [, n]) => sum + n, 0))}
          </div>
        </div>
        {run.errors.length > 0 && (
          <div>
            <div className="text-xs text-fg-3">Errors</div>
            <div className="text-2xl font-semibold text-tone-critical-fg">{run.errors.length}</div>
          </div>
        )}
      </div>
      {skipped.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Skipped reasons">
          {skipped.map(([code, n]) => (
            <span
              key={code}
              className="inline-flex h-badge items-center gap-1 rounded-xs px-1.5 text-xs text-fg-2 shadow-[inset_0_0_0_1px_var(--hg-line)]"
            >
              {skipLabel(code)} <span className="font-mono text-fg">{n}</span>
            </span>
          ))}
        </div>
      )}
      {run.planned && groups.length === 0 && (
        <EmptyState icon={MailCheck} title="No mails are due right now.">
          The chain picks records up again once their next step is due.
        </EmptyState>
      )}
      {groups.map(([templateId, mails]) => (
        <section key={templateId} aria-label={templateName(templateId)}>
          <h3 className="mb-1 flex items-baseline gap-2 text-xs font-semibold text-fg-2">
            {templateName(templateId)}
            <span className="font-mono text-fg-3">{mails.length}</span>
          </h3>
          <ul className="divide-y divide-line-subtle rounded-sm border border-line">
            {mails.slice(0, 50).map((mail) => (
              <li key={`${mail.entityType}-${mail.entityId}`}>
                <button
                  type="button"
                  onClick={() =>
                    drawer.open(mail.entityType === 'service_request' ? 'sr' : 'lr', mail.entityId)
                  }
                  className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-hover"
                >
                  <span className="font-mono text-xs">{mail.label}</span>
                  <span className="truncate text-xs text-fg-3">{mail.to.join(', ')}</span>
                </button>
              </li>
            ))}
            {mails.length > 50 && (
              <li className="px-3 py-1.5 text-xs text-fg-3">and {mails.length - 50} more</li>
            )}
          </ul>
        </section>
      ))}
      {run.errors.length > 0 && (
        <section aria-label="Errors">
          <h3 className="mb-1 text-xs font-semibold text-fg-2">Errors</h3>
          <ul className="grid gap-1 text-xs">
            {run.errors.map((error) => (
              <li key={`${error.entityType}-${error.entityId}`}>
                <span className="font-mono">{error.label}</span> · {error.action} ·{' '}
                <span className="text-tone-critical-fg">{error.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export function DispatchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const canRun = useCan('comms.dispatch')
  const dryRun = useDryRun()
  const dispatch = useStartDispatch()
  const { mutate, reset } = dryRun

  useEffect(() => {
    if (open) mutate()
    else reset()
  }, [open, mutate, reset])

  const run = dryRun.data
  const total = run ? Object.values(run.counts).reduce((sum, n) => sum + n, 0) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Send due mails"
        description="Dry run of the daily dispatch: what would be sent now. Nothing is sent until you confirm."
        className="w-[min(640px,calc(100vw-24px))]"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {canRun && (
              <Button
                variant="primary"
                icon={Send}
                disabled={!run || total === 0}
                loading={dispatch.pending}
                onClick={() => {
                  void dispatch.start()
                  onOpenChange(false)
                }}
              >
                {total ? `Send ${plural(total, 'mail')} now` : 'Send now'}
              </Button>
            )}
          </>
        }
      >
        <div>
          {dryRun.isPending && <SkeletonRows rows={6} />}
          {dryRun.isError && (
            <Banner tone="critical" icon={MailCheck} title="The dry run failed">
              {isApiError(dryRun.error) ? dryRun.error.detail : 'Try again in a moment.'}
            </Banner>
          )}
          {run && <DispatchSummary run={run} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
