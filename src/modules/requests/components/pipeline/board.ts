import type { PipelineStage, ServiceRequestStatus, Tone } from '@/lib/api/types'
import { addDays, businessToday } from '@/lib/format'
import { apiQuery, type PipelineSummaryExt } from '@/modules/requests/api'
import type { PipelineSearch } from '@/modules/requests/search'

/** Station tone per stage (the Line, DESIGN.md §1/§3.1). */
export const STAGE_TONES: Record<PipelineStage, Tone> = {
  imported: 'intake',
  invited: 'outreach',
  booked: 'booked',
  personalizing: 'workshop',
  ready: 'workshop',
  delivery: 'transit',
  deployed: 'done',
  closed: 'intake',
}

/** Cards per column page ("Show more" adds another page). */
export const COLUMN_PAGE = 50
export const CLOSED_STAGES = new Set<PipelineStage>(['deployed', 'closed'])

export type StageSummary = PipelineSummaryExt['stages'][number]

/** Board scope (filters) shared by every column's card query. */
export function columnQuery(
  search: PipelineSearch,
  stage: PipelineStage,
  statuses: readonly ServiceRequestStatus[],
  limit: number,
) {
  const closed = CLOSED_STAGES.has(stage)
  return apiQuery({
    siteId: search.siteId,
    regionId: search.regionId,
    deliveryType: search.deliveryType,
    vip: search.vip,
    campus: search.campus,
    needsAttention: search.needsAttention,
    stage,
    status: statuses.length ? statuses : undefined,
    perPage: limit,
    sort: closed ? '-statusChangedAt' : (search.sort ?? 'appointmentStartAt'),
    includeClosed: closed ? true : undefined,
    closedFrom: closed ? addDays(businessToday(), -14) : undefined,
  })
}
