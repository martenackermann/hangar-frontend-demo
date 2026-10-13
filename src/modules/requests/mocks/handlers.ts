import { http, HttpResponse, type RequestHandler } from 'msw'
import type {
  AttentionFlag,
  DispatchRun,
  DispatchSettings,
  HistoryEntry,
  LeaseReturnComment,
  MailLogDetail,
  MailLogEntry,
  NotificationTemplateInfo,
  PipelineStage,
  ServiceRequestStatus,
} from '@/lib/api/types'
import { addDays, businessToday, getBusinessTimeZone, toBusinessDate } from '@/lib/format'
import { authed, type MockActor } from '@/mocks/auth'
import { servedEnums } from '@/mocks/core/fixture'
import {
  contactDetail,
  contactListItem,
  displayName,
  historyEntries,
  leaseAttention,
  leaseDetail,
  leaseListItem,
  srAttention,
  srDetail,
  srListItem,
  stageOf,
  userRef,
} from '@/mocks/core/read-models'
import type { ContactRow, LeaseReturnRow, ServiceRequestRow } from '@/mocks/core/tables'
import { db } from '@/mocks/db'
import { csv, downloadLink, storeFile } from '@/mocks/files'
import { apiPath, intParam, listOf, problem, problems, readJson } from '@/mocks/http'
import { startJob } from '@/mocks/jobs'
import { boolValue, multiValue, paginate, parsePage, queryRows } from '@/mocks/list'
import { dispatchResult, executeDispatch, newRun, runInProgress, storeOutcome } from './dispatch'
import { settings } from './mail'
import {
  defaultSettings,
  SETTING_RANGES,
  type DispatchRunRow,
  type DispatchSettingsRow,
  type MailLogRow,
  type RangedSetting,
} from './tables'
import {
  findTemplate,
  htmlFromText,
  leaseMailContext,
  renderMail,
  sampleContext,
  srMailContext,
  templateName,
  TEMPLATES,
} from './templates'

/**
 * Mock endpoints of H1 Requests & Comms (API.md §4) — same shapes, filters, validation and
 * permissions as `app/modules/h1_requests/api/*`. Detail GETs and the action dispatch are
 * core handlers; this file adds lists, edits, histories, exports, contacts, the pipeline
 * summary and the communication endpoints. Exports are CSV in the demo (no xlsx writer).
 */

const SR_TERMINAL = new Set<ServiceRequestStatus>(['completed', 'cancelled'])
const LEASE_DEFAULT_HIDDEN = new Set(['replacement_ordered', 'closed'])
const REGION_MUTABLE = new Set<ServiceRequestStatus>([
  'imported',
  'imported_vip',
  'hardware_unavailable',
  'invited',
  'campus_info_sent',
  'reminder_1_sent',
  'reminder_2_sent',
  'escalated',
])
/** DESIGN.md §3.5 stage SLAs (mirrors the backend summary and `STAGE_SLA_DAYS`). */
const STAGE_SLA: Record<PipelineStage, number | null> = {
  imported: 2,
  invited: 10,
  booked: 14,
  personalizing: 3,
  ready: 2,
  delivery: 3,
  deployed: 5,
  closed: null,
}
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

type Errors = Record<string, string[]>
type EnumKey =
  | 'serviceRequestStatus'
  | 'pipelineStage'
  | 'leaseReturnStatus'
  | 'deliveryType'
  | 'procurementType'
  | 'attentionFlag'
  | 'mailStatus'
  | 'trigger'
type DateRange = [string | undefined, string | undefined]

// ---- small helpers ----------------------------------------------------------------------------

function enumValues(key: EnumKey): Set<string> {
  return new Set(servedEnums()[key].map((v) => v.value))
}

function checkEnum(url: URL, name: string, key: EnumKey, errors: Errors): string[] {
  const allowed = enumValues(key)
  const values = multiValue(url.searchParams, name)
  const bad = values.filter((v) => !allowed.has(v))
  if (bad.length) errors[name] = bad.map((b) => `Unknown value '${b}'.`)
  return values
}

function checkDate(url: URL, name: string, errors: Errors): string | undefined {
  const value = url.searchParams.get(name)
  if (!value) return undefined
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) {
    errors[name] = ['Enter a date as YYYY-MM-DD.']
    return undefined
  }
  return value
}

function checkRange(prefix: string, url: URL, errors: Errors): DateRange {
  const from = checkDate(url, `${prefix}From`, errors)
  const to = checkDate(url, `${prefix}To`, errors)
  if (from && to && from > to) errors[`${prefix}To`] = [`Must not be before ${prefix}From.`]
  return [from, to]
}

function inRange(value: string | null | undefined, [from, to]: DateRange): boolean {
  if (!from && !to) return true
  if (!value) return false
  return (!from || value >= from) && (!to || value <= to)
}

function vipMode(url: URL, errors: Errors, fallback = 'exclude'): string {
  const vip = url.searchParams.get('vip') ?? fallback
  if (!['exclude', 'include', 'only'].includes(vip)) errors.vip = ['Use exclude, include or only.']
  return vip
}

function vipMatches(mode: string, isVip: boolean): boolean {
  return mode === 'include' || (mode === 'only' ? isVip : !isVip)
}

function idsOf(url: URL, name: string, errors: Errors, allow: string[] = []): (number | string)[] {
  const out: (number | string)[] = []
  for (const value of multiValue(url.searchParams, name)) {
    if (allow.includes(value)) out.push(value)
    else if (/^\d+$/.test(value)) out.push(Number(value))
    else errors[name] = [`'${value}' is not a valid id.`]
  }
  return out
}

function unknownFields(body: Record<string, unknown>, allowed: readonly string[]): Errors {
  return Object.fromEntries(
    Object.keys(body)
      .filter((key) => !allowed.includes(key))
      .map((key) => [key, ['Unknown field.']]),
  )
}

function isPausedRow(row: {
  communicationPaused: boolean
  communicationResumeDate: string | null
}) {
  return (
    row.communicationPaused ||
    (row.communicationResumeDate !== null && row.communicationResumeDate > businessToday())
  )
}

function contactText(contactId: number | null): string {
  const contact = contactId ? db.collection('contacts').get(contactId) : undefined
  return contact
    ? `${displayName(contact)} ${contact.email ?? ''} ${contact.userId}`.toLowerCase()
    : ''
}

function statusOrder(key: 'serviceRequestStatus' | 'leaseReturnStatus') {
  return (status: string) => servedEnums()[key].findIndex((v) => v.value === status)
}

function pagedJson<T, R>(rows: readonly T[], request: Request, map: (row: T) => R) {
  const page = paginate(rows, parsePage(new URL(request.url).searchParams))
  return HttpResponse.json({ data: page.data.map(map), meta: page.meta })
}

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeZip(value: unknown, field: string, errors: Errors): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  if (String(value).trim() === '') return null
  const digits = String(value).replace(/\D/g, '')
  if (digits.length === 4) return `0${digits}`
  if (digits.length === 5) return digits
  errors[field] = ['Enter a 4- or 5-digit zip code.']
  return null
}

const nowIso = () => new Date().toISOString()

const versionConflict = (row: { version: number }, request: Request) =>
  problem(409, 'version_conflict', 'This record changed', {
    detail: 'Someone else updated it. Reload and try again.',
    currentVersion: row.version,
    request,
  })

// ---- service request filters -------------------------------------------------------------------

function filterServiceRequests(request: Request, actor: MockActor): ServiceRequestRow[] | Response {
  const url = new URL(request.url)
  const p = url.searchParams
  const errors: Errors = {}
  const statuses = checkEnum(url, 'status', 'serviceRequestStatus', errors)
  const stages = checkEnum(url, 'stage', 'pipelineStage', errors)
  const deliveryTypes = checkEnum(url, 'deliveryType', 'deliveryType', errors)
  const procurement = checkEnum(url, 'procurementType', 'procurementType', errors)
  const attention = checkEnum(url, 'attention', 'attentionFlag', errors) as AttentionFlag[]
  const regions = idsOf(url, 'regionId', errors, ['none'])
  const sites = idsOf(url, 'siteId', errors)
  const ids = idsOf(url, 'ids', errors)
  const vip = vipMode(url, errors)
  const editor = p.get('editorId')
  if (editor && !['me', 'none'].includes(editor) && !/^\d+$/.test(editor))
    errors.editorId = ["Use 'me', 'none' or a user id."]
  const appointment = checkRange('appointment', url, errors)
  const communication = checkRange('communication', url, errors)
  const imported = checkRange('imported', url, errors)
  const closed = checkRange('closed', url, errors)
  if (Object.keys(errors).length) return problems.validation(errors, undefined, request)

  const includeClosed = boolValue(p, 'includeClosed') ?? false
  const campus = boolValue(p, 'campus')
  const hasAppointment = boolValue(p, 'hasAppointment')
  const paused = boolValue(p, 'paused')
  const needsAttention = boolValue(p, 'needsAttention')
  const contactId = intParam(p.get('contactId') ?? undefined)
  const q = p.get('q')?.trim().toLowerCase()

  return db.collection('service_requests').filter((sr) => {
    if (statuses.length) {
      if (!statuses.includes(sr.status)) return false
    } else if (!includeClosed && SR_TERMINAL.has(sr.status)) return false
    if (stages.length && !stages.includes(stageOf(sr.status))) return false
    if (regions.length && !regions.includes(sr.regionId ?? 'none')) return false
    if (sites.length && !sites.includes(sr.supplyingSiteId ?? -1)) return false
    if (
      deliveryTypes.length &&
      !deliveryTypes.includes(sr.deliveryTypeOverride ?? sr.deliveryType ?? '')
    )
      return false
    if (procurement.length && !procurement.includes(sr.procurementType ?? '')) return false
    if (!vipMatches(vip, sr.isVip)) return false
    if (campus !== undefined && sr.isCampus !== campus) return false
    if (editor === 'none' && sr.editorUserId !== null) return false
    if (editor === 'me' && sr.editorUserId !== actor.id) return false
    if (editor && /^\d+$/.test(editor) && sr.editorUserId !== Number(editor)) return false
    if (contactId && sr.contactId !== contactId) return false
    const appointmentDay = sr.appointmentStartAt ? toBusinessDate(sr.appointmentStartAt) : null
    if (!inRange(appointmentDay, appointment)) return false
    if (hasAppointment !== undefined && Boolean(sr.appointmentStartAt) !== hasAppointment)
      return false
    if (!inRange(sr.communicationDate, communication)) return false
    if (!inRange(toBusinessDate(sr.importedAt), imported)) return false
    const closedAt = sr.completedAt ?? sr.cancelledAt
    if (!inRange(closedAt ? toBusinessDate(closedAt) : null, closed)) return false
    if (paused !== undefined && isPausedRow(sr) !== paused) return false
    if (attention.length || needsAttention !== undefined) {
      const flags = srAttention(sr)
      if (attention.length && !flags.some((f) => attention.includes(f))) return false
      if (needsAttention !== undefined && flags.length > 0 !== needsAttention) return false
    }
    if (ids.length && !ids.includes(sr.id)) return false
    if (q) {
      const text = `${sr.number} ${sr.taskNumber ?? ''} ${contactText(sr.contactId)}`.toLowerCase()
      if (!text.includes(q)) return false
    }
    return true
  })
}

const srStatusOrder = statusOrder('serviceRequestStatus')
const SR_SORTABLE: Record<string, (row: ServiceRequestRow) => unknown> = {
  number: (r) => r.number,
  status: (r) => srStatusOrder(r.status),
  importedAt: (r) => r.importedAt,
  statusChangedAt: (r) => r.statusChangedAt,
  appointmentStartAt: (r) => r.appointmentStartAt,
  communicationDate: (r) => r.communicationDate,
  region: (r) => (r.regionId ? db.collection('regions').get(r.regionId)?.name : null),
}

function sortedServiceRequests(request: Request, actor: MockActor) {
  const rows = filterServiceRequests(request, actor)
  if (rows instanceof Response) return rows
  return queryRows(rows, request, { sortable: SR_SORTABLE, defaultSort: '-importedAt' })
}

// ---- lease filters -----------------------------------------------------------------------------------

function sortedLeases(request: Request): LeaseReturnRow[] | Response {
  const url = new URL(request.url)
  const p = url.searchParams
  const errors: Errors = {}
  const statuses = checkEnum(url, 'status', 'leaseReturnStatus', errors)
  const attention = checkEnum(url, 'attention', 'attentionFlag', errors) as AttentionFlag[]
  const ids = idsOf(url, 'ids', errors)
  const vip = vipMode(url, errors)
  const retirement = checkRange('retirement', url, errors)
  const communication = checkRange('communication', url, errors)
  if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
  const includeClosed = boolValue(p, 'includeClosed') ?? false
  const campus = boolValue(p, 'campus')
  const linked = boolValue(p, 'linked')
  const paused = boolValue(p, 'paused')
  const needsAttention = boolValue(p, 'needsAttention')
  const q = p.get('q')?.trim().toLowerCase()
  const rows = db.collection('lease_returns').filter((lr) => {
    if (statuses.length) {
      if (!statuses.includes(lr.status)) return false
    } else if (!includeClosed && LEASE_DEFAULT_HIDDEN.has(lr.status)) return false
    if (!vipMatches(vip, lr.isVip)) return false
    if (campus !== undefined && lr.isCampus !== campus) return false
    if (!inRange(lr.retirementDate, retirement)) return false
    if (!inRange(lr.communicationDate, communication)) return false
    if (linked !== undefined && Boolean(lr.serviceRequestId) !== linked) return false
    if (paused !== undefined && isPausedRow(lr) !== paused) return false
    if (attention.length || needsAttention !== undefined) {
      const flags = leaseAttention(lr)
      if (attention.length && !flags.some((f) => attention.includes(f))) return false
      if (needsAttention !== undefined && flags.length > 0 !== needsAttention) return false
    }
    if (ids.length && !ids.includes(lr.id)) return false
    if (q) {
      const text = `${lr.assetTag} ${lr.serialNumber ?? ''} ${lr.userId} ${contactText(lr.contactId)}`
      if (!text.toLowerCase().includes(q)) return false
    }
    return true
  })
  const order = statusOrder('leaseReturnStatus')
  return queryRows(rows, request, {
    sortable: {
      retirementDate: (r) => r.retirementDate,
      assetTag: (r) => r.assetTag,
      status: (r) => order(r.status),
      statusChangedAt: (r) => r.statusChangedAt,
      communicationDate: (r) => r.communicationDate,
    },
    defaultSort: 'retirementDate',
  })
}

// ---- history -----------------------------------------------------------------------------------

function history(entityType: 'service_request' | 'lease_return', id: number): HistoryEntry[] {
  const mails: HistoryEntry[] = db
    .collection('mail_log')
    .filter((m) => m.entityType === entityType && m.entityId === id)
    .map((m) => ({
      kind: 'mail',
      id: `mail:${m.id}`,
      occurredAt: m.sentAt ?? m.queuedAt,
      actor: userRef(m.triggeredBy),
      trigger: m.trigger,
      mailLogId: m.id,
      templateId: m.templateId,
      subject: m.subject,
      to: m.toAddresses,
      status: m.status,
    }))
  return [...historyEntries(entityType, id), ...mails].sort(
    (a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id),
  )
}

// ---- region re-resolution for PATCH (SPEC §6.1, compact) --------------------------------------------

const KIND_RANK = { cost_center: 4, zip: 3, zip_prefix: 2, city: 1 } as const

function resolveRegion(sr: ServiceRequestRow): Partial<ServiceRequestRow> {
  const zip = (sr.deliveryZip ?? '').replace(/\D/g, '')
  const city = (sr.deliveryCity ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  const cost = (sr.costCenter ?? '').trim().toUpperCase()
  const rule = db
    .collection('region_rules')
    .filter((r) => {
      if (!r.isActive || (r.procurementType && r.procurementType !== sr.procurementType))
        return false
      if (r.matchKind === 'cost_center') return cost !== '' && r.pattern === cost
      if (r.matchKind === 'zip') return zip.length === 5 && r.pattern === zip
      if (r.matchKind === 'zip_prefix') return zip.length === 5 && zip.startsWith(r.pattern)
      return city !== '' && r.pattern === city
    })
    .sort(
      (a, b) =>
        Number(b.procurementType !== null) - Number(a.procurementType !== null) ||
        KIND_RANK[b.matchKind] - KIND_RANK[a.matchKind] ||
        (b.matchKind === 'zip_prefix' ? b.pattern.length - a.pattern.length : 0) ||
        b.priority - a.priority ||
        a.id - b.id,
    )[0]
  const region = rule ? db.collection('regions').get(rule.regionId) : undefined
  if (!rule || !region) {
    return {
      regionId: null,
      regionRuleId: null,
      supplyingSiteId: null,
      deliveryType: null,
      isCampus: false,
    }
  }
  return {
    regionId: region.id,
    regionRuleId: rule.id,
    supplyingSiteId: region.supplyingSiteId,
    deliveryType:
      rule.isCampus || sr.procurementType === 'removal'
        ? 'technician'
        : (rule.deliveryType ?? region.defaultDeliveryType),
    isCampus: rule.isCampus,
  }
}

async function patchServiceRequest(request: Request, id: number | undefined, actor: MockActor) {
  const sr = id ? db.collection('service_requests').get(id) : undefined
  if (!sr) return problems.notFound('Service request', id, request)
  const body = await readJson<Record<string, unknown>>(request)
  const unknown = unknownFields(body, [
    'version',
    'deliveryAddress',
    'onsiteContactPhone',
    'note',
    'costCenter',
    'regionId',
    'deliveryTypeOverride',
  ])
  if (Object.keys(unknown).length) return problems.validation(unknown, undefined, request)
  if (typeof body.version === 'number' && body.version !== sr.version)
    return versionConflict(sr, request)
  if (SR_TERMINAL.has(sr.status))
    return problems.conflict('Closed requests are read-only.', request)
  const errors: Errors = {}
  const patch: Partial<ServiceRequestRow> = {}
  const address = (body.deliveryAddress ?? {}) as Record<string, unknown>
  const columns = {
    street: 'deliveryStreet',
    city: 'deliveryCity',
    country: 'deliveryCountry',
    room: 'deliveryRoom',
    building: 'deliveryBuilding',
  } as const
  for (const [key, column] of Object.entries(columns))
    if (key in address) patch[column] = clean(address[key])
  if ('zip' in address) patch.deliveryZip = normalizeZip(address.zip, 'deliveryAddress.zip', errors)
  if ('costCenter' in body) patch.costCenter = clean(body.costCenter)?.toUpperCase() ?? null
  if ('onsiteContactPhone' in body) patch.onsiteContactPhone = clean(body.onsiteContactPhone)
  if ('note' in body) patch.note = clean(body.note)
  const regionChanged = (['deliveryZip', 'deliveryCity', 'costCenter'] as const).some(
    (column) => column in patch && patch[column] !== sr[column],
  )
  let override: 'set' | 'clear' | null = null
  if ('regionId' in body) {
    if (body.regionId === null) override = sr.regionOverridden ? 'clear' : null
    else if (!(sr.regionOverridden && body.regionId === sr.regionId)) override = 'set'
  }
  const deliveryChanged =
    'deliveryTypeOverride' in body && body.deliveryTypeOverride !== sr.deliveryTypeOverride
  if ((regionChanged || override || deliveryChanged) && !REGION_MUTABLE.has(sr.status))
    return problems.conflict('Region is locked after staging started.', request)
  if (deliveryChanged && body.deliveryTypeOverride !== null) {
    if (
      typeof body.deliveryTypeOverride !== 'string' ||
      !enumValues('deliveryType').has(body.deliveryTypeOverride)
    )
      errors.deliveryTypeOverride = ['Unknown delivery type.']
    else if (sr.isCampus && body.deliveryTypeOverride !== 'technician')
      errors.deliveryTypeOverride = ['Campus requests are always delivered by a technician.']
  }
  const region =
    override === 'set' && typeof body.regionId === 'number'
      ? db.collection('regions').get(body.regionId)
      : undefined
  if (override === 'set' && !region?.isActive) errors.regionId = ['Unknown or inactive region.']
  if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
  if (deliveryChanged)
    patch.deliveryTypeOverride = (body.deliveryTypeOverride ??
      null) as ServiceRequestRow['deliveryTypeOverride']
  let next: ServiceRequestRow = { ...sr, ...patch }
  if (override === 'set' && region) {
    next = {
      ...next,
      regionOverridden: true,
      regionId: region.id,
      regionRuleId: null,
      supplyingSiteId: region.supplyingSiteId,
      isCampus: false,
      deliveryType: next.procurementType === 'removal' ? 'technician' : region.defaultDeliveryType,
    }
  } else if (override === 'clear' || (regionChanged && !sr.regionOverridden)) {
    next = { ...next, regionOverridden: false, ...resolveRegion(next) }
  }
  const updated = db
    .collection('service_requests')
    .update(sr.id, { ...next, version: sr.version + 1 })
  return HttpResponse.json(srDetail(updated ?? sr, actor))
}

// ---- pipeline summary -----------------------------------------------------------------------------

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

function pipelineSummary(request: Request) {
  const url = new URL(request.url)
  const errors: Errors = {}
  const deliveryTypes = checkEnum(url, 'deliveryType', 'deliveryType', errors)
  const regions = idsOf(url, 'regionId', errors, ['none'])
  const sites = idsOf(url, 'siteId', errors)
  const vip = vipMode(url, errors)
  if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
  const campus = boolValue(url.searchParams, 'campus')
  const today = businessToday()
  const now = Date.now()
  const scope = (sr: ServiceRequestRow, ignoreVip = false) =>
    (!regions.length || regions.includes(sr.regionId ?? 'none')) &&
    (!sites.length || sites.includes(sr.supplyingSiteId ?? -1)) &&
    (!deliveryTypes.length ||
      deliveryTypes.includes(sr.deliveryTypeOverride ?? sr.deliveryType ?? '')) &&
    (ignoreVip || vipMatches(vip, sr.isVip)) &&
    (campus === undefined || sr.isCampus === campus)
  const all = db.collection('service_requests').filter((sr) => scope(sr))
  const since14 = addDays(today, -14)
  const recent = all.filter(
    (sr) =>
      !SR_TERMINAL.has(sr.status) ||
      toBusinessDate(sr.completedAt ?? sr.cancelledAt ?? sr.statusChangedAt) >= since14,
  )
  const ids = new Set(all.map((sr) => sr.id))
  const entered = db
    .collection('status_transitions')
    .filter(
      (t) =>
        t.entityType === 'service_request' &&
        ids.has(t.entityId) &&
        Date.parse(t.occurredAt) >= now - 86_400_000,
    )
  const enums = servedEnums()
  const stages = enums.pipelineStage.map(({ value, label }) => {
    const stage = value as PipelineStage
    const statuses = enums.serviceRequestStatus
      .filter((s) => s.stage === stage)
      .map((s) => {
        const rows = recent.filter((sr) => sr.status === s.value)
        return {
          status: s.value as ServiceRequestStatus,
          label: s.label,
          tone: s.tone ?? 'intake',
          count: rows.length,
          oldestStatusChangedAt: rows.map((r) => r.statusChangedAt).sort()[0] ?? null,
          attentionCount: rows.filter((r) => srAttention(r).length > 0).length,
        }
      })
    const sla = STAGE_SLA[stage]
    const aging = { onTime: 0, aging: 0, overdue: 0 }
    for (const sr of recent.filter((r) => stageOf(r.status) === stage)) {
      const ratio = sla ? (now - Date.parse(sr.statusChangedAt)) / (sla * 86_400_000) : 0
      if (!sla || ratio <= 0.6) aging.onTime += 1
      else if (ratio <= 1) aging.aging += 1
      else aging.overdue += 1
    }
    const stageOfStatus = (status: string | null) =>
      status ? stageOf(status as ServiceRequestStatus) : null
    return {
      stage,
      label,
      count: statuses.reduce((sum, s) => sum + s.count, 0),
      statuses,
      enteredLast24h: entered.filter(
        (t) => stageOfStatus(t.toStatus) === stage && stageOfStatus(t.fromStatus) !== stage,
      ).length,
      aging,
    }
  })
  const open = all.filter((sr) => !SR_TERMINAL.has(sr.status))
  const weekAgo = addDays(today, -6)
  const lead = median(
    all
      .filter(
        (sr) =>
          sr.status === 'completed' &&
          sr.completedAt !== null &&
          now - Date.parse(sr.completedAt) <= 30 * 86_400_000,
      )
      .map((sr) => (Date.parse(sr.completedAt ?? '') - Date.parse(sr.importedAt)) / 86_400_000),
  )
  const days = Array.from({ length: 12 }, (_, i) => addDays(today, i - 11))
  return HttpResponse.json({
    generatedAt: nowIso(),
    stages,
    totals: {
      open: open.length,
      vipOpen: db
        .collection('service_requests')
        .count((sr) => scope(sr, true) && sr.isVip && !SR_TERMINAL.has(sr.status)),
      needsAttention: open.filter((sr) => srAttention(sr).length > 0).length,
      completedLast7Days: all.filter(
        (sr) =>
          sr.status === 'completed' && sr.completedAt && toBusinessDate(sr.completedAt) >= weekAgo,
      ).length,
      cancelledLast7Days: all.filter(
        (sr) =>
          sr.status === 'cancelled' && sr.cancelledAt && toBusinessDate(sr.cancelledAt) >= weekAgo,
      ).length,
      appointmentsToday: all.filter(
        (sr) =>
          sr.status !== 'cancelled' &&
          sr.appointmentStartAt &&
          toBusinessDate(sr.appointmentStartAt) === today,
      ).length,
      leadTimeDays: lead === null ? null : Math.round(lead * 10) / 10,
    },
    trends: {
      days,
      open: days.map((day) => {
        const end = addDays(day, 1)
        return all.filter((sr) => {
          const closed = sr.completedAt ?? sr.cancelledAt
          return toBusinessDate(sr.importedAt) < end && (!closed || toBusinessDate(closed) >= end)
        }).length
      }),
      imported: days.map((day) => all.filter((sr) => toBusinessDate(sr.importedAt) === day).length),
      completed: days.map(
        (day) =>
          all.filter((sr) => sr.completedAt && toBusinessDate(sr.completedAt) === day).length,
      ),
    },
  })
}

// ---- communications -----------------------------------------------------------------------------------

type EntityType = NonNullable<MailLogEntry['entity']>['type']
const ENTITY_TYPES = new Set<string>([
  'service_request',
  'lease_return',
  'asset',
  'calloff_order',
  'inventory',
  'import_job',
  'tour',
  'contact',
])

function mailEntry(row: MailLogRow): MailLogEntry {
  return {
    id: row.id,
    notificationId: row.notificationId,
    templateId: row.templateId,
    templateName: templateName(row.templateId),
    status: row.status,
    to: row.toAddresses,
    cc: row.ccAddresses,
    subject: row.subject,
    entity:
      row.entityType && ENTITY_TYPES.has(row.entityType) && row.entityId !== null
        ? {
            type: row.entityType as EntityType,
            id: row.entityId,
            label: row.entityLabel ?? `#${row.entityId}`,
          }
        : null,
    trigger: row.trigger,
    triggeredBy: userRef(row.triggeredBy),
    queuedAt: row.queuedAt,
    sentAt: row.sentAt,
    error: row.error,
    attachmentCount: row.attachmentFileIds.length,
  }
}

function mailDetail(row: MailLogRow): MailLogDetail {
  const files = row.attachmentFileIds
    .map((id) => db.collection('stored_files').get(id))
    .filter((file) => file !== undefined)
  return {
    ...mailEntry(row),
    bodyHtml: row.bodyHtml ?? (row.bodyText ? htmlFromText(row.subject, row.bodyText) : null),
    bodyText: row.bodyText,
    attachments: files.map((file) => ({
      fileId: file.id,
      filename: file.filename,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      download: downloadLink(file),
    })),
  }
}

/** UTC instant of a business-local wall-clock time (hour precision, DST-safe). */
function businessInstant(day: string, hour: number): Date {
  const guess = new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: getBusinessTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(guess)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  const local = Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:00:00Z`)
  return new Date(guess.getTime() - (local - guess.getTime()))
}

function nextScheduledRun(): string {
  const today = businessToday()
  const candidate = businessInstant(today, 7)
  return (
    candidate.getTime() > Date.now() ? candidate : businessInstant(addDays(today, 1), 7)
  ).toISOString()
}

function settingsOut(row: DispatchSettingsRow): DispatchSettings {
  return {
    leaseMailsEnabled: row.leaseMailsEnabled,
    leaseInfoDaysBeforeRetirement: row.leaseInfoDaysBeforeRetirement,
    leaseReminder1AfterDays: row.leaseReminder1AfterDays,
    leaseReminder2AfterDays: row.leaseReminder2AfterDays,
    leaseEscalationAfterDays: row.leaseEscalationAfterDays,
    srMailsEnabled: row.srMailsEnabled,
    srInviteAfterImportDays: row.srInviteAfterImportDays,
    srReminder1AfterDays: row.srReminder1AfterDays,
    srReminder2AfterDays: row.srReminder2AfterDays,
    srEscalationAfterDays: row.srEscalationAfterDays,
    hardwareUnavailableMailEnabled: row.hardwareUnavailableMailEnabled,
    rescheduleMailEnabled: row.rescheduleMailEnabled,
    maxMailsPerRun: row.maxMailsPerRun,
    updatedAt: row.updatedAt,
    updatedBy: userRef(row.updatedBy),
    nextScheduledRunAt: nextScheduledRun(),
  }
}

function runOut(row: DispatchRunRow): DispatchRun {
  return {
    id: row.id,
    trigger: row.trigger,
    dryRun: row.dryRun,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    counts: row.counts,
    skipped: row.skipped,
    errors: row.errors,
    planned: row.planned,
    triggeredBy: userRef(row.triggeredBy),
    jobId: row.backgroundJobId,
  }
}

function sentLast7Days(): Record<string, number> {
  const since = Date.now() - 7 * 86_400_000
  const counts: Record<string, number> = {}
  for (const mail of db.collection('mail_log').all()) {
    if (mail.status === 'sent' && mail.sentAt && Date.parse(mail.sentAt) >= since)
      counts[mail.templateId] = (counts[mail.templateId] ?? 0) + 1
  }
  return counts
}

const FLAGS = [
  'leaseMailsEnabled',
  'srMailsEnabled',
  'hardwareUnavailableMailEnabled',
  'rescheduleMailEnabled',
] as const

function putSettings(body: Record<string, unknown>, actorId: number): DispatchSettingsRow | Errors {
  const errors: Errors = unknownFields(body, [...FLAGS, ...Object.keys(SETTING_RANGES)])
  for (const flag of FLAGS)
    if (typeof body[flag] !== 'boolean') errors[flag] = ['Required (true or false).']
  for (const [key, [, low, high]] of Object.entries(SETTING_RANGES)) {
    const value = body[key]
    if (typeof value !== 'number' || !Number.isInteger(value))
      errors[key] = ['Enter a whole number.']
    else if (value < low || value > high) errors[key] = [`Must be between ${low} and ${high}.`]
  }
  if (Object.keys(errors).length) return errors
  const now = nowIso()
  const current =
    db.collection('dispatch_settings').get(1) ??
    db.collection('dispatch_settings').insert(defaultSettings(now))
  const values: Partial<DispatchSettingsRow> = { updatedBy: actorId, updatedAt: now }
  for (const flag of FLAGS) values[flag] = body[flag] as boolean
  for (const key of Object.keys(SETTING_RANGES) as RangedSetting[])
    values[key] = body[key] as number
  return db.collection('dispatch_settings').update(current.id, values) ?? current
}

function templatesList() {
  const counts = sentLast7Days()
  return TEMPLATES.map((t): NotificationTemplateInfo & { entityType: string | null } => ({
    id: t.id,
    name: t.name,
    owner: t.owner === 'core' ? 'h1' : t.owner,
    description: t.description,
    trigger: t.trigger,
    recipients: t.recipients,
    subjectTemplate: t.subject,
    sentLast7Days: counts[t.id] ?? 0,
    entityType: t.entityType,
  }))
}

function previewTemplate(request: Request, templateId: string) {
  const template = findTemplate(templateId)
  if (!template) return problems.notFound('Template', templateId, request)
  const p = new URL(request.url).searchParams
  const entityId = intParam(p.get('entityId') ?? undefined)
  const entityType = p.get('entityType')
  if (!entityId) return HttpResponse.json(renderMail(template.id, sampleContext(template)))
  if (!template.entityType)
    return problems.validation(
      { entityId: ['This template has no entity preview.'] },
      undefined,
      request,
    )
  if (entityType && entityType !== template.entityType)
    return problems.validation(
      { entityType: [`This template renders ${template.entityType} records.`] },
      undefined,
      request,
    )
  if (template.entityType === 'service_request') {
    const sr = db.collection('service_requests').get(entityId)
    if (!sr) return problems.notFound('Service request', entityId, request)
    return HttpResponse.json(renderMail(template.id, srMailContext(sr)))
  }
  const lease = db.collection('lease_returns').get(entityId)
  if (!lease) return problems.notFound('Lease return', entityId, request)
  return HttpResponse.json(renderMail(template.id, leaseMailContext(lease)))
}

// ---- exports ----------------------------------------------------------------------------------------

function srExport(rows: readonly ServiceRequestRow[], actorId: number) {
  const enums = servedEnums()
  const label = (key: 'serviceRequestStatus' | 'deliveryType', value: string | null) =>
    enums[key].find((v) => v.value === value)?.label ?? value ?? ''
  const body = csv([
    [
      'SR number',
      'Task number',
      'Status',
      'Stage',
      'User id',
      'User name',
      'Email',
      'Region',
      'Hub',
      'Delivery type',
      'Campus',
      'VIP',
      'Appointment',
      'Communication date',
      'Imported at',
      'ITSM state',
      'Cost centre',
      'Attention',
    ],
    ...rows.map((sr) => {
      const contact = db.collection('contacts').get(sr.contactId)
      return [
        sr.number,
        sr.taskNumber,
        label('serviceRequestStatus', sr.status),
        stageOf(sr.status),
        contact?.userId,
        contact ? displayName(contact) : '',
        contact?.email,
        sr.regionId ? db.collection('regions').get(sr.regionId)?.name : '',
        sr.supplyingSiteId ? db.collection('sites').get(sr.supplyingSiteId)?.code : '',
        label('deliveryType', sr.deliveryTypeOverride ?? sr.deliveryType),
        sr.isCampus ? 'yes' : 'no',
        sr.isVip ? 'yes' : 'no',
        sr.appointmentStartAt,
        sr.communicationDate,
        sr.importedAt,
        sr.itsmState,
        sr.costCenter,
        srAttention(sr).join(', '),
      ]
    }),
  ])
  return storeFile({
    filename: `service-requests-${businessToday()}.csv`,
    contentType: 'text/csv',
    body,
    purpose: 'export',
    actorId,
  })
}

function leaseExport(rows: readonly LeaseReturnRow[], actorId: number) {
  const body = csv([
    [
      'Asset tag',
      'Serial',
      'Model',
      'Retirement date',
      'User id',
      'User name',
      'Email',
      'Status',
      'Communication date',
      'Linked SR',
      'VIP',
      'Campus',
    ],
    ...rows.map((lr) => {
      const contact = lr.contactId ? db.collection('contacts').get(lr.contactId) : undefined
      const sr = lr.serviceRequestId
        ? db.collection('service_requests').get(lr.serviceRequestId)
        : undefined
      return [
        lr.assetTag,
        lr.serialNumber,
        lr.model,
        lr.retirementDate,
        lr.userId,
        contact ? displayName(contact) : '',
        contact?.email,
        lr.status,
        lr.communicationDate,
        sr?.number,
        lr.isVip ? 'yes' : 'no',
        lr.isCampus ? 'yes' : 'no',
      ]
    }),
  ])
  return storeFile({
    filename: `lease-returns-${businessToday()}.csv`,
    contentType: 'text/csv',
    body,
    purpose: 'export',
    actorId,
  })
}

// ---- handlers -------------------------------------------------------------------------------------------

export const handlers: RequestHandler[] = [
  // --- service requests ---
  http.get(
    apiPath('/service-requests'),
    authed('sr.read', ({ request, actor }) => {
      const rows = sortedServiceRequests(request, actor)
      if (rows instanceof Response) return rows
      return pagedJson(rows, request, (row) => srListItem(row, actor))
    }),
  ),
  http.post(
    apiPath('/service-requests/export'),
    authed('sr.export', ({ request, actor }) => {
      const rows = sortedServiceRequests(request, actor)
      if (rows instanceof Response) return rows
      return HttpResponse.json(downloadLink(srExport(rows, actor.id)))
    }),
  ),
  http.get(
    apiPath('/service-requests/by-number/:number'),
    authed<{ number: string }>('sr.read', ({ request, params, actor }) => {
      const number = params.number.trim().toUpperCase()
      const sr = db.collection('service_requests').find((s) => s.number === number)
      return sr
        ? HttpResponse.json(srDetail(sr, actor))
        : problems.notFound('Service request', number, request)
    }),
  ),
  http.get(
    apiPath('/service-requests/:id/history'),
    authed<{ id: string }>('sr.read', ({ request, params }) => {
      const id = intParam(params.id)
      if (!id || !db.collection('service_requests').has(id))
        return problems.notFound('Service request', params.id, request)
      return listOf(history('service_request', id))
    }),
  ),
  http.patch(
    apiPath('/service-requests/:id'),
    authed<{ id: string }>('sr.update', ({ request, params, actor }) =>
      patchServiceRequest(request, intParam(params.id), actor),
    ),
  ),

  // --- lease returns ---
  http.get(
    apiPath('/lease-returns'),
    authed('lease.read', ({ request, actor }) => {
      const rows = sortedLeases(request)
      if (rows instanceof Response) return rows
      return pagedJson(rows, request, (row) => leaseListItem(row, actor))
    }),
  ),
  http.post(
    apiPath('/lease-returns/export'),
    authed('lease.export', ({ request, actor }) => {
      const rows = sortedLeases(request)
      if (rows instanceof Response) return rows
      return HttpResponse.json(downloadLink(leaseExport(rows, actor.id)))
    }),
  ),
  http.patch(
    apiPath('/lease-returns/:id'),
    authed<{ id: string }>('lease.manage', async ({ request, params, actor }) => {
      const id = intParam(params.id)
      const lease = id ? db.collection('lease_returns').get(id) : undefined
      if (!lease) return problems.notFound('Lease return', params.id, request)
      const body = await readJson<Record<string, unknown>>(request)
      const unknown = unknownFields(body, ['version', 'escalationEmail'])
      if (Object.keys(unknown).length) return problems.validation(unknown, undefined, request)
      if (typeof body.version === 'number' && body.version !== lease.version)
        return versionConflict(lease, request)
      if (lease.status === 'closed')
        return problems.conflict('Closed lease returns are read-only.', request)
      const email = body.escalationEmail
      if (
        email !== undefined &&
        email !== null &&
        (typeof email !== 'string' || !EMAIL.test(email))
      )
        return problems.validation(
          { escalationEmail: ['Enter a valid email address.'] },
          undefined,
          request,
        )
      const updated =
        'escalationEmail' in body
          ? db.collection('lease_returns').update(lease.id, {
              escalationEmail: typeof email === 'string' ? email.trim().toLowerCase() : null,
              version: lease.version + 1,
            })
          : lease
      return HttpResponse.json(leaseDetail(updated ?? lease, actor))
    }),
  ),
  http.get(
    apiPath('/lease-returns/:id/comments'),
    authed<{ id: string }>('lease.read', ({ request, params }) => {
      const id = intParam(params.id)
      if (!id || !db.collection('lease_returns').has(id))
        return problems.notFound('Lease return', params.id, request)
      const comments: LeaseReturnComment[] = db
        .collection('lease_return_comments')
        .filter((c) => c.leaseReturnId === id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
        .map((c) => ({
          id: c.id,
          body: c.body,
          author: userRef(c.authorUserId) ?? {
            id: c.authorUserId,
            displayName: 'Unknown',
            email: '',
            role: 'viewer',
          },
          createdAt: c.createdAt,
        }))
      return listOf(comments)
    }),
  ),
  http.post(
    apiPath('/lease-returns/:id/comments'),
    authed<{ id: string }>('lease.manage', async ({ request, params, actor }) => {
      const id = intParam(params.id)
      if (!id || !db.collection('lease_returns').has(id))
        return problems.notFound('Lease return', params.id, request)
      const body = await readJson<{ body: unknown }>(request)
      const text = typeof body.body === 'string' ? body.body.trim() : ''
      if (!text)
        return problems.validation({ body: ['The comment must not be empty.'] }, undefined, request)
      if (text.length > 2000)
        return problems.validation({ body: ['At most 2000 characters.'] }, undefined, request)
      const row = db
        .collection('lease_return_comments')
        .insert({ leaseReturnId: id, body: text, authorUserId: actor.id, createdAt: nowIso() })
      const comment: LeaseReturnComment = {
        id: row.id,
        body: row.body,
        author: userRef(actor.id) ?? { id: actor.id, displayName: '', email: '', role: actor.role },
        createdAt: row.createdAt,
      }
      return HttpResponse.json(comment, { status: 201 })
    }),
  ),
  http.get(
    apiPath('/lease-returns/:id/history'),
    authed<{ id: string }>('lease.read', ({ request, params }) => {
      const id = intParam(params.id)
      if (!id || !db.collection('lease_returns').has(id))
        return problems.notFound('Lease return', params.id, request)
      return listOf(history('lease_return', id))
    }),
  ),

  // --- contacts ---
  http.get(
    apiPath('/contacts'),
    authed('sr.read', ({ request }) => {
      const url = new URL(request.url)
      const errors: Errors = {}
      const vip = vipMode(url, errors, 'include')
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      const vipIds = new Set(
        db
          .collection('vip_entries')
          .all()
          .map((v) => v.userId),
      )
      const q = url.searchParams.get('q')?.trim().toLowerCase()
      const rows = db
        .collection('contacts')
        .filter(
          (c) =>
            vipMatches(vip, vipIds.has(c.userId)) &&
            (!q || `${displayName(c)} ${c.email ?? ''} ${c.userId}`.toLowerCase().includes(q)),
        )
      const sorted = queryRows(rows, request, {
        sortable: { lastName: (c: ContactRow) => c.lastName, userId: (c: ContactRow) => c.userId },
        defaultSort: 'lastName',
      })
      if (sorted instanceof Response) return sorted
      return pagedJson(sorted, request, contactListItem)
    }),
  ),
  http.get(
    apiPath('/contacts/:id'),
    authed<{ id: string }>('sr.read', ({ request, params }) => {
      const contact = db.collection('contacts').get(intParam(params.id))
      return contact
        ? HttpResponse.json(contactDetail(contact))
        : problems.notFound('Contact', params.id, request)
    }),
  ),
  http.patch(
    apiPath('/contacts/:id'),
    authed<{ id: string }>('contacts.update', async ({ request, params }) => {
      const contact = db.collection('contacts').get(intParam(params.id))
      if (!contact) return problems.notFound('Contact', params.id, request)
      const body = await readJson<Record<string, unknown>>(request)
      const errors = unknownFields(body, [
        'email',
        'phone',
        'mobile',
        'department',
        'gender',
        'street',
        'zip',
        'city',
        'building',
        'room',
      ])
      const patch: Partial<ContactRow> = {}
      if ('email' in body) {
        const email = clean(body.email)
        if (email && !EMAIL.test(email)) errors.email = ['Enter a valid email address.']
        patch.email = email?.toLowerCase() ?? null
      }
      if ('gender' in body) {
        if (!['female', 'male', 'diverse', 'unspecified'].includes(String(body.gender)))
          errors.gender = ['Choose a value.']
        else patch.gender = body.gender as ContactRow['gender']
      }
      for (const key of [
        'phone',
        'mobile',
        'department',
        'street',
        'city',
        'building',
        'room',
      ] as const)
        if (key in body) patch[key] = clean(body[key])
      if ('zip' in body) patch.zip = normalizeZip(body.zip, 'zip', errors)
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      const updated = db.collection('contacts').update(contact.id, patch) ?? contact
      return HttpResponse.json(contactDetail(updated))
    }),
  ),

  // --- pipeline ---
  http.get(
    apiPath('/pipeline/summary'),
    authed('sr.read', ({ request }) => pipelineSummary(request)),
  ),

  // --- mail log ---
  http.get(
    apiPath('/mail-log'),
    authed('comms.read', ({ request }) => {
      const url = new URL(request.url)
      const p = url.searchParams
      const errors: Errors = {}
      const statuses = checkEnum(url, 'status', 'mailStatus', errors)
      const triggers = checkEnum(url, 'trigger', 'trigger', errors)
      const from = checkDate(url, 'from', errors)
      const to = checkDate(url, 'to', errors)
      if (from && to && from > to) errors.to = ["Must not be before 'from'."]
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      const templates = multiValue(p, 'templateId')
      const entityType = p.get('entityType')
      const entityId = intParam(p.get('entityId') ?? undefined)
      const q = p.get('q')?.trim().toLowerCase()
      const rows = db.collection('mail_log').filter((m) => {
        if (templates.length && !templates.includes(m.templateId)) return false
        if (statuses.length && !statuses.includes(m.status)) return false
        if (triggers.length && !triggers.includes(m.trigger)) return false
        if (entityType && m.entityType !== entityType) return false
        if (entityId && m.entityId !== entityId) return false
        const day = toBusinessDate(m.queuedAt)
        if ((from && day < from) || (to && day > to)) return false
        const text = `${m.toAddresses.join(' ')} ${m.subject ?? ''} ${m.entityLabel ?? ''}`
        return !q || text.toLowerCase().includes(q)
      })
      const sorted = queryRows(rows, request, {
        sortable: { queuedAt: (m: MailLogRow) => m.queuedAt, sentAt: (m: MailLogRow) => m.sentAt },
        defaultSort: '-queuedAt',
      })
      if (sorted instanceof Response) return sorted
      return pagedJson(sorted, request, mailEntry)
    }),
  ),
  http.get(
    apiPath('/mail-log/:id'),
    authed<{ id: string }>('comms.read', ({ request, params }) => {
      const row = db.collection('mail_log').get(intParam(params.id))
      return row
        ? HttpResponse.json(mailDetail(row))
        : problems.notFound('Mail', params.id, request)
    }),
  ),

  // --- dispatch settings ---
  http.get(
    apiPath('/dispatch-settings'),
    authed('comms.read', () => HttpResponse.json(settingsOut(settings()))),
  ),
  http.put(
    apiPath('/dispatch-settings'),
    authed('comms.settings', async ({ request, actor }) => {
      const result = putSettings(await readJson<Record<string, unknown>>(request), actor.id)
      if (!('id' in result)) return problems.validation(result, undefined, request)
      return HttpResponse.json(settingsOut(result as DispatchSettingsRow))
    }),
  ),

  // --- dispatch runs ---
  http.get(
    apiPath('/comms/dispatch-runs'),
    authed('comms.read', ({ request }) => {
      const dryRun = boolValue(new URL(request.url).searchParams, 'dryRun')
      const rows = db
        .collection('dispatch_runs')
        .filter((r) => dryRun === undefined || r.dryRun === dryRun)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id - a.id)
      return pagedJson(rows, request, runOut)
    }),
  ),
  http.get(
    apiPath('/comms/dispatch-runs/:id'),
    authed<{ id: string }>('comms.read', ({ request, params }) => {
      const row = db.collection('dispatch_runs').get(intParam(params.id))
      return row
        ? HttpResponse.json(runOut(row))
        : problems.notFound('Dispatch run', params.id, request)
    }),
  ),
  http.post(
    apiPath('/comms/dispatch-runs'),
    authed('comms.dispatch', async ({ request, actor }) => {
      const body = await readJson<Record<string, unknown>>(request)
      const unknown = unknownFields(body, ['dryRun'])
      if (Object.keys(unknown).length) return problems.validation(unknown, undefined, request)
      if (body.dryRun === true) {
        const run = newRun({ dryRun: true, actor, status: 'running' })
        const updated = storeOutcome(run.id, executeDispatch(true), 'succeeded') ?? run
        return HttpResponse.json(runOut(updated))
      }
      if (runInProgress())
        return problems.conflict('A dispatch run is already in progress.', request)
      const run = newRun({ dryRun: false, actor, status: 'queued' })
      const accepted = startJob({
        kind: 'comms_dispatch',
        actor,
        durationMs: 2200,
        message: 'Sending due mails',
        run: () => {
          const outcome = executeDispatch(false)
          storeOutcome(run.id, outcome, 'succeeded')
          return dispatchResult(run.id, outcome)
        },
      })
      db.collection('dispatch_runs').update(run.id, {
        backgroundJobId: accepted.jobId,
        status: 'running',
      })
      return HttpResponse.json({ ...accepted, dispatchRunId: run.id }, { status: 202 })
    }),
  ),

  // --- notification templates ---
  http.get(
    apiPath('/notification-templates'),
    authed('comms.read', () => listOf(templatesList())),
  ),
  http.get(
    apiPath('/notification-templates/:templateId/preview'),
    authed<{ templateId: string }>('comms.read', ({ request, params }) =>
      previewTemplate(request, params.templateId),
    ),
  ),
]
