import type { ImportJobSummary } from '@/lib/api/types'
import { formatNumber, plural } from '@/lib/format'

/**
 * Import job status (DESIGN.md §3.4): running → "Importing 412 / 1,312"; completed with
 * warnings → "Imported with 6 warnings" in tone caution (SPEC_RESOLUTIONS #56).
 */
export function importStatusLabel(
  job: Pick<ImportJobSummary, 'status' | 'counts' | 'dryRun'>,
): string | undefined {
  const { status, counts } = job
  if (status === 'processing') {
    return `Importing ${formatNumber(counts.processed)}${counts.total ? ` / ${formatNumber(counts.total)}` : ''}`
  }
  if (status === 'completed' && counts.warnings > 0) {
    return `${job.dryRun ? 'Checked' : 'Imported'} with ${plural(counts.warnings, 'warning')}`
  }
  if (job.dryRun && status === 'completed') return 'Checked'
  return undefined
}

/** "1 min 12 s" between two timestamps (or until now while running). */
export function formatElapsed(from: string | null, to: string | null, now = Date.now()): string {
  if (!from) return ''
  const end = to ? Date.parse(to) : now
  const seconds = Math.max(0, Math.round((end - Date.parse(from)) / 1000))
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return rest ? `${minutes} min ${rest} s` : `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min`
}
