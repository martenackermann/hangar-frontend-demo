import { importJobTone, StatusBadge } from '@/components/domain/status'
import { ProgressMeter } from '@/components/ui/feedback'
import type { ImportJobSummary } from '@/lib/api/types'
import { importStatusLabel } from './import-format'

export function ImportStatusBadge({
  job,
  variant = 'quiet',
}: {
  job: Pick<ImportJobSummary, 'status' | 'counts' | 'dryRun'>
  variant?: 'quiet' | 'wash'
}) {
  return (
    <StatusBadge
      entity="importJobStatus"
      state={job.status}
      variant={variant}
      tone={importJobTone(job)}
      label={importStatusLabel(job)}
    />
  )
}

/** Status cell of the history table: badge, plus a thin meter while the import runs. */
export function ImportStatusCell({ job }: { job: ImportJobSummary }) {
  return (
    <span className="grid min-w-0 gap-1">
      <ImportStatusBadge job={job} />
      {job.status === 'processing' && (
        <ProgressMeter
          max={100}
          label={`Import ${job.id} progress`}
          valueText={`${job.progressPercent ?? 0} %`}
          segments={[{ value: job.progressPercent ?? 0, tone: 'outreach' }]}
        />
      )}
    </span>
  )
}
