import { http, HttpResponse, type RequestHandler } from 'msw'
import type {
  ArticleInput,
  RegionPatch,
  RegionResolutionResult,
  RegionRuleInput,
  RegionRuleTestBody,
  VipEntryInput,
} from '@/lib/api/types'
import { authed } from '@/mocks/auth'
import type { RegionRow, RegionRuleRow } from '@/mocks/core/tables'
import { regionRef, siteRef } from '@/mocks/core/read-models'
import { db } from '@/mocks/db'
import { apiPath, intParam, listOf, noContent, problem, problems, readJson } from '@/mocks/http'
import { startJob } from '@/mocks/jobs'
import { filterIn, listResponse, multiValue } from '@/mocks/list'
import {
  candidateRules,
  deliveryFor,
  leaseIsCampus,
  normalizePattern,
  regionColumns,
} from './engine/region'
import {
  article,
  articleCounts,
  articleDetail,
  regionDetail,
  rule,
  siteSetting,
  vipEntry,
} from './read-models'

/** Trimmed text, or `null` for an absent or blank value. */
function blankToNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? ''
  return text.length > 0 ? text : null
}

/** `/articles`, `/regions/{id}`, `/region-rules`, `/vip-entries` (API.md §5.2–§5.4). */
const nowIso = () => new Date().toISOString()

// ---- articles ---------------------------------------------------------------------------------

const ARTICLE_FIELDS = [
  'number',
  'category',
  'name',
  'modelNumber',
  'manufacturer',
  'externalPartNumber',
  'internalDescription',
  'weightKg',
] as const
const ARTICLE_REQUIRED = [
  'number',
  'category',
  'name',
  'modelNumber',
  'manufacturer',
  'internalDescription',
  'weightKg',
] as const

function articleErrors(body: Partial<ArticleInput>, partial: boolean): Record<string, string[]> {
  const errors: Record<string, string[]> = {}
  for (const key of Object.keys(body)) {
    if (!(ARTICLE_FIELDS as readonly string[]).includes(key)) errors[key] = ['Unknown field.']
  }
  for (const key of ARTICLE_REQUIRED) {
    const value = body[key]
    if ((!partial || key in body) && (value === undefined || value === null || value === '')) {
      errors[key] = [partial ? 'This field cannot be empty.' : 'Field required']
    }
  }
  if (
    body.weightKg !== undefined &&
    body.weightKg !== null &&
    (typeof body.weightKg !== 'number' || body.weightKg < 0)
  ) {
    errors.weightKg = ['Input should be greater than or equal to 0']
  }
  return errors
}

function articleConflicts(
  values: Partial<ArticleInput>,
  active: boolean,
  excludeId?: number,
): Record<string, string[]> {
  const errors: Record<string, string[]> = {}
  const others = db.collection('articles').filter((a) => a.id !== excludeId)
  const same = (a: string, b: string | undefined) => !!b && a.toLowerCase() === b.toLowerCase()
  if (others.some((a) => same(a.number, values.number))) {
    errors.number = ['Another article already uses this number.']
  }
  if (others.some((a) => same(a.modelNumber, values.modelNumber))) {
    errors.modelNumber = ['Another article already uses this model number.']
  }
  if (
    active &&
    others.some((a) => a.isActive && same(a.internalDescription, values.internalDescription))
  ) {
    errors.internalDescription = ['Another active article already uses this device type.']
  }
  return errors
}

function conflict(errors: Record<string, string[]>, request: Request) {
  return problem(409, 'conflict', 'Conflict', {
    detail: 'The article conflicts with an existing article.',
    errors,
    request,
  })
}

function emptySetting(articleId: number, siteId: number) {
  return {
    articleId,
    siteId,
    bufferQty: 0,
    minQty: null,
    maxQty: null,
    stockQty: 0,
    stockGoodsIn: 0,
    stockStaging: 0,
    stockGoodsOut: 0,
    demandQty: 0,
    calculatedAt: null,
    lastOrderDate: null,
    lastOrderedQty: null,
  }
}

const articleHandlers: RequestHandler[] = [
  http.get(
    apiPath('/articles'),
    authed('master.read', ({ request }) => {
      const active = new URL(request.url).searchParams.get('active') ?? 'true'
      const counts = articleCounts()
      return listResponse(
        db
          .collection('articles')
          .filter((a) => active === 'all' || a.isActive === (active === 'true')),
        request,
        {
          sortable: {
            number: (a) => a.number,
            name: (a) => a.name,
            category: (a) => a.category,
            internalDescription: (a) => a.internalDescription,
          },
          defaultSort: 'number',
          search: (a, q) =>
            [
              a.number,
              a.name,
              a.modelNumber,
              a.internalDescription,
              a.manufacturer,
              a.externalPartNumber ?? '',
            ]
              .join(' ')
              .toLowerCase()
              .includes(q.toLowerCase()),
          filters: { category: filterIn((a) => a.category) },
          map: (a) => article(a, counts),
        },
      )
    }),
  ),
  http.get(
    apiPath('/articles/:id'),
    authed<{ id: string }>('master.read', ({ params, request }) => {
      const row = db.collection('articles').get(Number(params.id))
      return row
        ? HttpResponse.json(articleDetail(row))
        : problems.notFound('Article', params.id, request)
    }),
  ),
  http.post(
    apiPath('/articles'),
    authed('master.manage', async ({ request }) => {
      const body = await readJson<ArticleInput>(request)
      const errors = articleErrors(body, false)
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      const conflicts = articleConflicts(body, true)
      if (Object.keys(conflicts).length) return conflict(conflicts, request)
      const now = nowIso()
      const row = db.collection('articles').insert({
        number: body.number!.trim(),
        category: body.category!,
        name: body.name!.trim(),
        modelNumber: body.modelNumber!.trim(),
        manufacturer: body.manufacturer!.trim(),
        externalPartNumber: blankToNull(body.externalPartNumber),
        internalDescription: body.internalDescription!.trim(),
        weightKg: body.weightKg!,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      for (const hub of db.collection('sites').filter((s) => s.kind === 'hub')) {
        db.collection('article_site_settings').insert(emptySetting(row.id, hub.id))
      }
      return HttpResponse.json(articleDetail(row), { status: 201 })
    }),
  ),
  http.patch(
    apiPath('/articles/:id'),
    authed<{ id: string }>('master.manage', async ({ params, request }) => {
      const row = db.collection('articles').get(Number(params.id))
      if (!row) return problems.notFound('Article', params.id, request)
      const body = await readJson<ArticleInput>(request)
      const errors = articleErrors(body, true)
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      const conflicts = articleConflicts({ ...row, ...body }, row.isActive, row.id)
      if (Object.keys(conflicts).length) return conflict(conflicts, request)
      const updated = db.collection('articles').update(row.id, { ...body, updatedAt: nowIso() })!
      return HttpResponse.json(articleDetail(updated))
    }),
  ),
  http.post(
    apiPath('/articles/:id/actions/:action'),
    authed<{ id: string; action: string }>('master.manage', ({ params, request }) => {
      const row = db.collection('articles').get(Number(params.id))
      if (!row) return problems.notFound('Article', params.id, request)
      if (params.action !== 'activate' && params.action !== 'deactivate') {
        return problems.validation(
          { action: ["Input should be 'activate' or 'deactivate'"] },
          undefined,
          request,
        )
      }
      if (params.action === 'activate' && !row.isActive) {
        const clash = db
          .collection('articles')
          .find(
            (a) =>
              a.id !== row.id &&
              a.isActive &&
              a.internalDescription.toLowerCase() === row.internalDescription.toLowerCase(),
          )
        if (clash) {
          return problem(409, 'conflict', 'Conflict', {
            detail: `Article ${clash.number} is active with the same device type '${row.internalDescription}'. Deactivate it first.`,
            errors: {
              internalDescription: ['Another active article already uses this device type.'],
            },
            request,
          })
        }
      }
      const updated = db.collection('articles').update(row.id, {
        isActive: params.action === 'activate',
        updatedAt: nowIso(),
      })!
      return HttpResponse.json(articleDetail(updated))
    }),
  ),
  http.patch(
    apiPath('/articles/:id/site-settings/:siteId'),
    authed<{ id: string; siteId: string }>('master.manage', async ({ params, request }) => {
      const row = db.collection('articles').get(Number(params.id))
      if (!row) return problems.notFound('Article', params.id, request)
      const site = db.collection('sites').get(Number(params.siteId))
      if (site?.kind !== 'hub') return problems.notFound('Hub', params.siteId, request)
      const body = await readJson<{ minQty: number | null; maxQty: number | null }>(request)
      const errors: Record<string, string[]> = {}
      for (const key of ['minQty', 'maxQty'] as const) {
        const value = body[key]
        if (value !== null && value !== undefined && (!Number.isInteger(value) || value < 0)) {
          errors[key] = ['Input should be greater than or equal to 0']
        }
      }
      if (body.minQty != null && body.maxQty != null && body.maxQty < body.minQty) {
        errors.maxQty = ['Max must be greater than or equal to min.']
      }
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      const settings = db.collection('article_site_settings')
      const current = settings.find((s) => s.articleId === row.id && s.siteId === site.id)
      const patch = { minQty: body.minQty ?? null, maxQty: body.maxQty ?? null }
      const updated = current
        ? settings.update(current.id, patch)!
        : settings.insert({ ...emptySetting(row.id, site.id), ...patch })
      return HttpResponse.json(siteSetting(updated))
    }),
  ),
]

// ---- regions + rules ---------------------------------------------------------------------------

type RuleCheck =
  | { ok: true; pattern: string }
  | { ok: false; errors: Record<string, string[]> }
  | { ok: false; duplicate: true }

function checkRule(values: RegionRuleInput, excludeId?: number): RuleCheck {
  const errors: Record<string, string[]> = {}
  const region = db.collection('regions').get(values.regionId)
  if (!region) errors.regionId = ['Unknown region.']
  if (!['cost_center', 'zip', 'zip_prefix', 'city'].includes(values.matchKind)) {
    errors.matchKind = ["Input should be 'cost_center', 'zip', 'zip_prefix' or 'city'"]
    return { ok: false, errors }
  }
  let pattern = normalizePattern(values.matchKind, values.pattern ?? '')
  if (values.matchKind === 'zip' && ![4, 5].includes(pattern.length)) {
    errors.pattern = ['A zip rule needs a 4–5 digit zip code.']
  } else if (values.matchKind === 'zip') {
    pattern = pattern.padStart(5, '0')
  }
  if (values.matchKind === 'zip_prefix' && (pattern.length < 1 || pattern.length > 5)) {
    errors.pattern = ['A zip prefix needs 1–5 digits.']
  }
  if (!pattern && !errors.pattern) errors.pattern = ['The pattern is empty after normalization.']
  if (values.deliveryType === 'parcel_to_pickup_point' && region && !region.pickupPointName) {
    errors.deliveryType = [`Region ${region.name} has no pickup point. Add one first.`]
  }
  if (Object.keys(errors).length) return { ok: false, errors }
  const duplicate = db
    .collection('region_rules')
    .find(
      (r) =>
        r.id !== excludeId &&
        r.matchKind === values.matchKind &&
        r.pattern === pattern &&
        r.procurementType === (values.procurementType ?? null),
    )
  return duplicate ? { ok: false, duplicate: true } : { ok: true, pattern }
}

function ruleProblem(check: Exclude<RuleCheck, { ok: true }>, request: Request) {
  if ('duplicate' in check) {
    return problem(409, 'conflict', 'Conflict', {
      detail: 'A rule with the same match kind, pattern and procurement type already exists.',
      errors: { pattern: ['A rule for this pattern already exists.'] },
      request,
    })
  }
  return problems.validation(check.errors, undefined, request)
}

const regionHandlers: RequestHandler[] = [
  http.get(
    apiPath('/regions/:id'),
    authed<{ id: string }>('master.read', ({ params, request }) => {
      const detail = regionDetail(Number(params.id))
      return detail ? HttpResponse.json(detail) : problems.notFound('Region', params.id, request)
    }),
  ),
  http.patch(
    apiPath('/regions/:id'),
    authed<{ id: string }>('master.manage', async ({ params, request }) => {
      const row = db.collection('regions').get(Number(params.id))
      if (!row) return problems.notFound('Region', params.id, request)
      const body = await readJson<RegionPatch>(request)
      const errors: Record<string, string[]> = {}
      if (
        body.supplyingSiteId !== undefined &&
        db.collection('sites').get(body.supplyingSiteId)?.kind !== 'hub'
      ) {
        errors.supplyingSiteId = ['Choose a hub as supplying site.']
      }
      for (const key of ['name', 'defaultDeliveryType', 'isActive', 'sortOrder'] as const) {
        if (key in body && body[key] === null) errors[key] = ['This field cannot be empty.']
      }
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      const { pickupPoint, ...rest } = body
      const patch: Partial<RegionRow> = { ...rest }
      if (pickupPoint !== undefined) {
        patch.pickupPointName = pickupPoint?.name ?? null
        patch.pickupPointStreet = pickupPoint?.street ?? null
        patch.pickupPointZip = pickupPoint?.zip ?? null
        patch.pickupPointCity = pickupPoint?.city ?? null
      }
      const merged = { ...row, ...patch }
      const usesPickup =
        merged.defaultDeliveryType === 'parcel_to_pickup_point' ||
        db
          .collection('region_rules')
          .find(
            (r) =>
              r.regionId === row.id && r.isActive && r.deliveryType === 'parcel_to_pickup_point',
          ) !== undefined
      if (!merged.pickupPointName && usesPickup) {
        return problems.validation(
          { pickupPoint: ['A pickup point is required for parcel-to-pickup-point delivery.'] },
          undefined,
          request,
        )
      }
      db.collection('regions').update(row.id, patch)
      return HttpResponse.json(regionDetail(row.id))
    }),
  ),
  http.get(
    apiPath('/region-rules'),
    authed('master.read', ({ request }) => {
      const params = new URL(request.url).searchParams
      const regionId = intParam(params.get('regionId') ?? undefined)
      const kinds = multiValue(params, 'matchKind')
      const active = params.get('active') ?? 'all'
      return listOf(
        db
          .collection('region_rules')
          .filter(
            (r) =>
              (regionId === undefined || r.regionId === regionId) &&
              (kinds.length === 0 || kinds.includes(r.matchKind)) &&
              (active === 'all' || r.isActive === (active === 'true')),
          )
          .sort(
            (a, b) =>
              a.regionId - b.regionId ||
              a.matchKind.localeCompare(b.matchKind) ||
              a.pattern.localeCompare(b.pattern),
          )
          .map(rule),
      )
    }),
  ),
  http.post(
    apiPath('/region-rules/test'),
    authed('master.read', async ({ request }) => {
      const body = await readJson<RegionRuleTestBody>(request)
      const { normalized, rules } = candidateRules(body)
      const winner = rules[0]
      const region = winner ? db.collection('regions').get(winner.regionId) : undefined
      const result: RegionResolutionResult = {
        resolved: Boolean(winner && region),
        region: winner ? regionRef(winner.regionId) : null,
        rule: winner ? rule(winner) : null,
        deliveryType:
          winner && region
            ? deliveryFor(winner, region, body.procurementType ?? null, winner.isCampus)
            : null,
        isCampus: Boolean(winner?.isCampus),
        supplyingSite: region ? siteRef(region.supplyingSiteId) : null,
        normalizedInput: normalized,
        candidates: rules.map((r, index) => ({ rule: rule(r), rank: index + 1 })),
      }
      return HttpResponse.json(result)
    }),
  ),
  http.post(
    apiPath('/region-rules/reapply'),
    authed('master.manage', ({ actor }) => {
      const accepted = startJob({
        kind: 'regions_reapply',
        actor,
        durationMs: 1800,
        message: 'Re-resolving regions',
        run: () => {
          let serviceRequestsChanged = 0
          let unresolved = 0
          for (const sr of db.collection('service_requests').all()) {
            const columns = regionColumns(sr)
            if (!columns) continue
            const keys = Object.keys(columns) as (keyof typeof columns)[]
            if (keys.some((key) => sr[key] !== columns[key])) {
              db.collection('service_requests').update(sr.id, columns)
              serviceRequestsChanged++
            }
            if (columns.regionId === null) unresolved++
          }
          let leaseReturnsChanged = 0
          for (const lease of db.collection('lease_returns').filter((l) => l.status !== 'closed')) {
            const campus = leaseIsCampus(lease.contactId, lease.costCenter)
            if (campus !== lease.isCampus) {
              db.collection('lease_returns').update(lease.id, { isCampus: campus })
              leaseReturnsChanged++
            }
          }
          return {
            kind: 'regions_reapply',
            serviceRequestsChanged,
            leaseReturnsChanged,
            unresolved,
          }
        },
      })
      return HttpResponse.json(accepted, { status: 202 })
    }),
  ),
  http.post(
    apiPath('/region-rules'),
    authed('master.manage', async ({ request }) => {
      const body = await readJson<RegionRuleInput>(request)
      const values: RegionRuleInput = {
        regionId: body.regionId ?? 0,
        matchKind: body.matchKind ?? ('' as RegionRuleInput['matchKind']),
        pattern: body.pattern ?? '',
        procurementType: body.procurementType ?? null,
        deliveryType: body.deliveryType ?? null,
        isCampus: body.isCampus ?? false,
        priority: body.priority ?? 0,
        isActive: body.isActive ?? true,
        note: body.note ?? null,
      }
      const check = checkRule(values)
      if (!check.ok) return ruleProblem(check, request)
      const now = nowIso()
      const row = db
        .collection('region_rules')
        .insert({ ...values, pattern: check.pattern, createdAt: now, updatedAt: now } as Omit<
          RegionRuleRow,
          'id'
        >)
      return HttpResponse.json(rule(row), { status: 201 })
    }),
  ),
  http.patch(
    apiPath('/region-rules/:id'),
    authed<{ id: string }>('master.manage', async ({ params, request }) => {
      const row = db.collection('region_rules').get(Number(params.id))
      if (!row) return problems.notFound('Region rule', params.id, request)
      const body = await readJson<RegionRuleInput>(request)
      const check = checkRule({ ...row, ...body }, row.id)
      if (!check.ok) return ruleProblem(check, request)
      const updated = db
        .collection('region_rules')
        .update(row.id, { ...body, pattern: check.pattern })!
      return HttpResponse.json(rule(updated))
    }),
  ),
  http.delete(
    apiPath('/region-rules/:id'),
    authed<{ id: string }>('master.manage', ({ params, request }) => {
      const id = Number(params.id)
      if (!db.collection('region_rules').get(id)) {
        return problems.notFound('Region rule', params.id, request)
      }
      db.collection('region_rules').remove(id)
      for (const sr of db.collection('service_requests').filter((s) => s.regionRuleId === id)) {
        db.collection('service_requests').update(sr.id, { regionRuleId: null })
      }
      return noContent()
    }),
  ),
]

// ---- VIP list ----------------------------------------------------------------------------------

/** `recompute_vip`: flag only, status unchanged (SPEC §5.1 vip_entries). */
function recomputeVip(userId: string) {
  const vip = db.collection('vip_entries').find((v) => v.userId === userId) !== undefined
  const contact = db.collection('contacts').find((c) => c.userId === userId)
  for (const sr of db.collection('service_requests').filter((s) => s.contactId === contact?.id)) {
    if (sr.isVip !== vip) db.collection('service_requests').update(sr.id, { isVip: vip })
  }
  for (const lease of db.collection('lease_returns').filter((l) => l.userId === userId)) {
    if (lease.isVip !== vip) db.collection('lease_returns').update(lease.id, { isVip: vip })
  }
}

function vipErrors(body: Partial<VipEntryInput>, partial: boolean): Record<string, string[]> {
  const errors: Record<string, string[]> = {}
  const allowed = [
    'firstName',
    'lastName',
    'vipType',
    'title',
    'note',
    ...(partial ? [] : ['userId']),
  ]
  for (const key of Object.keys(body)) if (!allowed.includes(key)) errors[key] = ['Unknown field.']
  if (!partial && !/^[A-Za-z0-9]{3,16}$/.test(body.userId ?? '')) {
    errors.userId = ['Enter the ITSM user id (3–16 letters or digits).']
  }
  for (const key of ['lastName', 'vipType'] as const) {
    if ((!partial || key in body) && !String(body[key] ?? '').trim()) {
      errors[key] = ['This field cannot be empty.']
    }
  }
  return errors
}

const vipHandlers: RequestHandler[] = [
  http.get(
    apiPath('/vip-entries'),
    authed('master.read', ({ request }) => {
      const q = new URL(request.url).searchParams.get('q')?.trim().toLowerCase()
      return listOf(
        db
          .collection('vip_entries')
          .filter(
            (v) =>
              !q ||
              [v.userId, v.firstName ?? '', v.lastName, v.vipType, v.title ?? '']
                .join(' ')
                .toLowerCase()
                .includes(q),
          )
          .sort(
            (a, b) =>
              a.lastName.localeCompare(b.lastName) ||
              (a.firstName ?? '').localeCompare(b.firstName ?? ''),
          )
          .map(vipEntry),
      )
    }),
  ),
  http.post(
    apiPath('/vip-entries'),
    authed('master.manage', async ({ request }) => {
      const body = await readJson<VipEntryInput>(request)
      const errors = vipErrors(body, false)
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      const userId = body.userId!.trim().toUpperCase()
      if (db.collection('vip_entries').find((v) => v.userId === userId)) {
        return problem(409, 'duplicate', 'Already exists', {
          detail: `User ${userId} is already on the VIP list.`,
          errors: { userId: ['This user is already on the VIP list.'] },
          request,
        })
      }
      const row = db.collection('vip_entries').insert({
        userId,
        firstName: blankToNull(body.firstName),
        lastName: body.lastName!.trim(),
        vipType: body.vipType!.trim(),
        title: blankToNull(body.title),
        note: blankToNull(body.note),
        createdAt: nowIso(),
      })
      recomputeVip(userId)
      return HttpResponse.json(vipEntry(row), { status: 201 })
    }),
  ),
  http.patch(
    apiPath('/vip-entries/:id'),
    authed<{ id: string }>('master.manage', async ({ params, request }) => {
      const row = db.collection('vip_entries').get(Number(params.id))
      if (!row) return problems.notFound('VIP entry', params.id, request)
      const body = await readJson<VipEntryInput>(request)
      const errors = vipErrors(body, true)
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      const updated = db.collection('vip_entries').update(row.id, body)!
      return HttpResponse.json(vipEntry(updated))
    }),
  ),
  http.delete(
    apiPath('/vip-entries/:id'),
    authed<{ id: string }>('master.manage', ({ params, request }) => {
      const row = db.collection('vip_entries').get(Number(params.id))
      if (!row) return problems.notFound('VIP entry', params.id, request)
      db.collection('vip_entries').remove(row.id)
      recomputeVip(row.userId)
      return noContent()
    }),
  ),
]

export const masterHandlers: RequestHandler[] = [
  ...articleHandlers,
  ...regionHandlers,
  ...vipHandlers,
]
