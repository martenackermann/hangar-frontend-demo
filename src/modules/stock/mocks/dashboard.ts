import type { DashboardKpis, PipelineStage } from '@/lib/api/types'
import { addDays, businessToday, toBusinessDate } from '@/lib/format'
import { db } from '@/mocks/db'
import type { ServiceRequestRow } from '@/mocks/fixtures/types'
import {
  articleRef,
  regionRef,
  siteRef,
  srAttention,
  SR_TERMINAL,
  stageOf,
  WITH_APPT,
} from '@/mocks/core/read-models'
import { businessDateTime } from './common'
import { orderQty } from './stock'

/** Dashboard KPIs (API.md §8.6) — port of `services/dashboard.py`. */

const STAGES: PipelineStage[] = [
  'imported',
  'invited',
  'booked',
  'personalizing',
  'ready',
  'delivery',
  'deployed',
  'closed',
]
const CHAIN_MAIL = {
  service_request: [
    'send_invitation',
    'send_campus_info',
    'send_reminder_1',
    'send_reminder_2',
    'escalate',
  ],
  lease_return: ['send_info', 'send_reminder_1', 'send_reminder_2', 'escalate'],
} as const

function mondayOf(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay() || 7
  return addDays(day, 1 - weekday)
}

export function dashboardKpis(siteId: number | null, regionId: number | null): DashboardKpis {
  const now = new Date()
  const today = businessToday()
  const monday = mondayOf(today)
  const weekEnd = addDays(monday, 6)
  const lastMonday = addDays(monday, -7)
  const inScope = (sr: ServiceRequestRow) =>
    (siteId === null || sr.supplyingSiteId === siteId) &&
    (regionId === null || sr.regionId === regionId)
  const srs = db.collection('service_requests').filter(inScope)
  const open = srs.filter((sr) => !SR_TERMINAL.has(sr.status))
  const withAppt = (sr: ServiceRequestRow) => WITH_APPT.has(sr.status) || sr.status === 'completed'
  const apptDate = (sr: ServiceRequestRow) =>
    sr.appointmentStartAt ? toBusinessDate(sr.appointmentStartAt) : null
  const completedOn = (sr: ServiceRequestRow) =>
    sr.status === 'completed' && sr.completedAt ? toBusinessDate(sr.completedAt) : null
  const leases = db.collection('lease_returns').all()
  const activeLease = (status: string) => status !== 'replacement_ordered' && status !== 'closed'
  const settings = db
    .collection('article_site_settings')
    .filter(
      (s) =>
        (siteId === null || s.siteId === siteId) &&
        db.collection('articles').get(s.articleId)?.isActive === true,
    )
  const since30 = addDays(today, -30)
  const recent = srs.filter((sr) => (completedOn(sr) ?? '') >= since30 && sr.completedAt)
  const avg =
    recent.length > 0
      ? Math.round(
          (recent.reduce(
            (sum, sr) => sum + (Date.parse(sr.completedAt!) - Date.parse(sr.importedAt)),
            0,
          ) /
            recent.length /
            86_400_000) *
            10,
        ) / 10
      : null
  const srIds = new Set(srs.map((sr) => sr.id))
  const startOfToday = businessDateTime(today)
  const scoped = siteId !== null || regionId !== null
  const chainMails = db
    .collection('status_transitions')
    .count(
      (t) =>
        t.occurredAt >= startOfToday &&
        (CHAIN_MAIL[t.entityType] as readonly string[]).includes(t.action) &&
        (!scoped || (t.entityType === 'service_request' && srIds.has(t.entityId))),
    )
  const jobs = db.collection('background_jobs').all()
  const lastJob = (kind: string) =>
    jobs
      .filter((j) => j.kind === kind && j.status === 'succeeded' && j.finishedAt)
      .map((j) => j.finishedAt!)
      .sort()
      .pop() ?? null
  const lastImport =
    [
      lastJob('import'),
      db
        .collection('service_requests')
        .all()
        .map((sr) => sr.lastImportedAt)
        .sort()
        .pop() ?? null,
      leases
        .map((l) => l.lastSeenAt)
        .sort()
        .pop() ?? null,
    ]
      .filter((v): v is string => Boolean(v))
      .sort()
      .pop() ?? null
  const lastCalc =
    db
      .collection('article_site_settings')
      .all()
      .map((s) => s.calculatedAt)
      .filter(Boolean)
      .sort()
      .pop() ?? null

  const closedSince = now.getTime() - 14 * 86_400_000
  const stageCounts = new Map<PipelineStage, number>(STAGES.map((s) => [s, 0]))
  for (const sr of srs) {
    if (SR_TERMINAL.has(sr.status) && Date.parse(sr.statusChangedAt) < closedSince) continue
    const stage = stageOf(sr.status)
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1)
  }
  const days = (start: string, n: number) => Array.from({ length: n }, (_, i) => addDays(start, i))
  const past = days(addDays(today, -13), 14)
  const ahead = days(today, 14)
  const perDay = (dates: string[], pick: (sr: ServiceRequestRow) => string | null) => {
    const counts = new Map<string, number>()
    for (const sr of srs) {
      const day = pick(sr)
      if (day) counts.set(day, (counts.get(day) ?? 0) + 1)
    }
    return dates.map((date) => ({ date, count: counts.get(date) ?? 0 }))
  }
  const regions = db
    .collection('regions')
    .filter(
      (r) =>
        r.isActive &&
        (regionId === null || r.id === regionId) &&
        (siteId === null || r.supplyingSiteId === siteId),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  const completedThisWeek = (sr: ServiceRequestRow) => (completedOn(sr) ?? '') >= monday

  return {
    asOf: now.toISOString(),
    today,
    filters: { siteId, regionId },
    tiles: {
      openServiceRequests: open.length,
      needsAttention: open.filter((sr) => srAttention(sr, now).length > 0).length,
      appointmentsToday: srs.filter((sr) => withAppt(sr) && apptDate(sr) === today).length,
      appointmentsThisWeek: srs.filter((sr) => {
        const d = apptDate(sr)
        return withAppt(sr) && d !== null && d >= monday && d <= weekEnd
      }).length,
      completedThisWeek: srs.filter(completedThisWeek).length,
      completedLastWeek: srs.filter((sr) => {
        const d = completedOn(sr)
        return d !== null && d >= lastMonday && d < monday
      }).length,
      escalatedServiceRequests: srs.filter((sr) => sr.status === 'escalated').length,
      escalatedLeaseReturns: leases.filter((l) => l.status === 'escalated').length,
      hardwareUnavailable: srs.filter((sr) => sr.status === 'hardware_unavailable').length,
      rescheduleNeeded: srs.filter((sr) => sr.status === 'reschedule_needed').length,
      leaseReturnsDueNext30Days: leases.filter(
        (l) =>
          activeLease(l.status) &&
          l.retirementDate >= today &&
          l.retirementDate <= addDays(today, 30),
      ).length,
      leaseReturnsOverdue: leases.filter((l) => activeLease(l.status) && l.retirementDate < today)
        .length,
      stockShortfallArticles: settings.filter((s) => s.demandQty > s.stockQty).length,
      openInventories: db
        .collection('inventories')
        .count((i) => i.status === 'open' && (siteId === null || i.siteId === siteId)),
      chainMailsSentToday: chainMails,
      avgDaysImportToCompletion30d: avg,
      lastImportAt: lastImport,
      lastAppointmentSyncAt: lastJob('appointments_sync'),
      lastStockCalculationAt: lastCalc,
    },
    stageCounts: STAGES.map((stage) => ({ stage, count: stageCounts.get(stage) ?? 0 })),
    series: {
      completionsPerDay: perDay(past, completedOn),
      appointmentsPerDay: perDay(ahead, (sr) => (withAppt(sr) ? apptDate(sr) : null)),
      importedPerDay: perDay(past, (sr) => toBusinessDate(sr.importedAt)),
    },
    regionLoad: regions.map((region) => {
      const inRegion = srs.filter((sr) => sr.regionId === region.id)
      return {
        region: regionRef(region.id)!,
        open: inRegion.filter((sr) => !SR_TERMINAL.has(sr.status)).length,
        booked: inRegion.filter((sr) => WITH_APPT.has(sr.status)).length,
        completedThisWeek: inRegion.filter(completedThisWeek).length,
        escalated: inRegion.filter((sr) => sr.status === 'escalated').length,
      }
    }),
    stockAlerts: settings
      .filter((s) => s.demandQty > s.stockQty)
      .sort((a, b) => b.demandQty - b.stockQty - (a.demandQty - a.stockQty))
      .slice(0, 10)
      .map((s) => ({
        article: articleRef(s.articleId)!,
        site: siteRef(s.siteId)!,
        stock: s.stockQty,
        demand: s.demandQty,
        buffer: s.bufferQty,
        orderQty: orderQty(s.demandQty, s.stockQty, s.bufferQty),
      })),
  }
}
