import type { BackgroundJob, EntityRef, JobAccepted, JobKind, JobStatus } from '@/lib/api/types'
import type { MockActor } from './auth'
import { db } from './db'

/**
 * Mock background jobs (API.md §1.7, §3.9): `startJob()` returns `202 JobAccepted`; progress is
 * derived from elapsed time when `GET /jobs/{id}` is polled; `run()` executes once at the end
 * (the job's side effects) and its return value becomes `result`.
 *
 *   const accepted = startJob({ kind: 'stock_recalculate', actor, durationMs: 2000, run: () => ({ kind: 'stock_recalculate', … }) })
 *   return HttpResponse.json(accepted, { status: 202 })
 */
export interface BackgroundJobRow {
  id: number
  kind: JobKind
  status: JobStatus
  progressProcessed: number
  progressTotal: number | null
  message: string | null
  result: BackgroundJob['result']
  error: string | null
  cancelRequested: boolean
  entityType: EntityRef['type'] | null
  entityId: number | null
  entityLabel: string | null
  createdBy: number | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  /** Mock only: planned duration. */
  durationMs: number
}

declare module './db' {
  interface DemoCollections {
    background_jobs: BackgroundJobRow
  }
}

const runners = new Map<number, () => BackgroundJob['result']>()

export function startJob(input: {
  kind: JobKind
  actor: MockActor | null
  entity?: EntityRef | null
  /** Default 2.5 s. */
  durationMs?: number
  total?: number | null
  message?: string
  run: () => BackgroundJob['result']
}): JobAccepted {
  const row = db.collection('background_jobs').insert({
    kind: input.kind,
    status: 'queued',
    progressProcessed: 0,
    progressTotal: input.total ?? null,
    message: input.message ?? null,
    result: null,
    error: null,
    cancelRequested: false,
    entityType: input.entity?.type ?? null,
    entityId: input.entity?.id ?? null,
    entityLabel: input.entity?.label ?? null,
    createdBy: input.actor?.id ?? null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    durationMs: input.durationMs ?? 2500,
  })
  runners.set(row.id, input.run)
  // Finish even when nobody polls (e.g. the user navigated away).
  setTimeout(() => advanceJob(row.id), row.durationMs + 50)
  return { jobId: row.id, status: 'queued' }
}

/** Bring a job up to date with the clock (called on every read). */
export function advanceJob(id: number): BackgroundJobRow | undefined {
  const jobs = db.collection('background_jobs')
  const row = jobs.get(id)
  if (!row || !['queued', 'running'].includes(row.status)) return row
  const elapsed = Date.now() - Date.parse(row.createdAt)
  if (row.cancelRequested) {
    return jobs.update(id, { status: 'cancelled', finishedAt: new Date().toISOString() })
  }
  if (elapsed < 300) return row
  if (elapsed < row.durationMs) {
    const fraction = Math.min(0.95, (elapsed - 300) / Math.max(1, row.durationMs - 300))
    return jobs.update(id, {
      status: 'running',
      startedAt: row.startedAt ?? new Date(Date.parse(row.createdAt) + 300).toISOString(),
      progressProcessed: row.progressTotal
        ? Math.round(row.progressTotal * fraction)
        : row.progressProcessed,
    })
  }
  const runner = runners.get(id)
  runners.delete(id)
  try {
    const result = runner ? runner() : null
    return jobs.update(id, {
      status: 'succeeded',
      startedAt: row.startedAt ?? row.createdAt,
      finishedAt: new Date().toISOString(),
      progressProcessed: row.progressTotal ?? row.progressProcessed,
      result,
    })
  } catch (error) {
    return jobs.update(id, {
      status: 'failed',
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'The job failed.',
    })
  }
}

export function serializeJob(row: BackgroundJobRow): BackgroundJob {
  const users = db.table<{
    id: number
    email: string
    firstName: string
    lastName: string
    role: BackgroundJob['createdBy'] extends infer U
      ? U extends { role: infer R }
        ? R
        : never
      : never
  }>('users')
  const creator = row.createdBy ? users.get(row.createdBy) : undefined
  const percent =
    row.progressTotal && row.progressTotal > 0
      ? (row.progressProcessed / row.progressTotal) * 100
      : row.status === 'running'
        ? Math.min(95, ((Date.now() - Date.parse(row.createdAt)) / row.durationMs) * 100)
        : row.status === 'succeeded'
          ? 100
          : null
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    progress: { processed: row.progressProcessed, total: row.progressTotal, percent },
    message: row.message,
    error: row.error,
    cancelRequested: row.cancelRequested,
    entity:
      row.entityType && row.entityId
        ? { type: row.entityType, id: row.entityId, label: row.entityLabel ?? '' }
        : null,
    createdBy: creator
      ? {
          id: creator.id,
          displayName: `${creator.firstName} ${creator.lastName}`,
          email: creator.email,
          role: creator.role,
        }
      : null,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    result: row.result,
  }
}
