import { http, HttpResponse, type RequestHandler } from 'msw'
import type {
  AppConfig,
  JobKind,
  JobStatus,
  LoginResponse,
  SavedViewCreate,
  SearchHit,
  SearchKind,
  SearchResponse,
  SyncState,
  Tone,
} from '@/lib/api/types'
import {
  actorForUser,
  actorFromRequest,
  authed,
  issueToken,
  TOKEN_TTL_MS,
  type MockActor,
} from '@/mocks/auth'
import { db } from '@/mocks/db'
import { serveFile } from '@/mocks/files'
import { apiPath, intParam, listOf, noContent, problem, problems, readJson } from '@/mocks/http'
import { advanceJob, serializeJob, startJob } from '@/mocks/jobs'
import { multiValue } from '@/mocks/list'
import { applyAction, applyBulk, type Resource } from '@/mocks/workflow'
import { getFixture, servedEnums } from './fixture'
import {
  assetDetail,
  displayName,
  leaseDetail,
  me,
  persona,
  region,
  savedView,
  site,
  srDetail,
  stockLocation,
  userSummary,
} from './read-models'
import type { ServiceRequestRow } from './tables'

/**
 * Core endpoints (API.md §3) of the mock API: auth, /me, meta, reference lists, search, saved
 * views, files, jobs, demo reset, health, the generic workflow action dispatch and the detail
 * GETs the drawer frames need. Slice handlers come first in the chain and may override.
 */

export const DEMO_PASSWORD = 'demo1234'

function loginResponse(userId: number): LoginResponse | null {
  const user = db.collection('users').get(userId)
  if (!user) return null
  db.collection('users').update(user.id, { lastLoginAt: new Date().toISOString() })
  return {
    accessToken: issueToken(user.id),
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    user: me(user),
  }
}

function toneOf(
  key: 'serviceRequestStatus' | 'leaseReturnStatus' | 'assetStatus',
  value: string,
): { label: string; tone: Tone | null } {
  const entry = servedEnums()[key].find((e) => e.value === value)
  return { label: entry?.label ?? value, tone: entry?.tone ?? null }
}

// ---- search (SPEC §6.19) ---------------------------------------------------------------------

const PLACE = /^(LOC:)?([A-Z]{1,2}\d{1,2}-\d{1,3})$/

function srHit(sr: ServiceRequestRow, exact: boolean): SearchHit {
  const contact = db.collection('contacts').get(sr.contactId)
  const regionRow = sr.regionId ? db.collection('regions').get(sr.regionId) : undefined
  const { label, tone } = toneOf('serviceRequestStatus', sr.status)
  return {
    kind: 'service_request',
    id: sr.id,
    title: sr.number,
    subtitle: [label, regionRow?.name, contact ? displayName(contact) : null]
      .filter(Boolean)
      .join(' · '),
    status: sr.status,
    tone,
    href: `/service-requests?sr=${sr.id}`,
    exact,
  }
}

function assetHit(id: number, exact: boolean): SearchHit | null {
  const asset = db.collection('assets').get(id)
  if (!asset) return null
  const article = asset.articleId ? db.collection('articles').get(asset.articleId) : undefined
  const location = db.collection('stock_locations').get(asset.locationId)
  const { label, tone } = toneOf('assetStatus', asset.status)
  return {
    kind: 'asset',
    id: asset.id,
    title: `${asset.assetTag ?? asset.serialNumber} · ${article?.name ?? asset.model ?? 'Unknown model'}`,
    subtitle: [asset.serialNumber, label, location?.name, asset.installationPlace]
      .filter(Boolean)
      .join(' · '),
    status: asset.status,
    tone,
    href: `/stock/assets?asset=${asset.id}`,
    exact,
  }
}

function leaseHit(id: number, exact: boolean): SearchHit | null {
  const lr = db.collection('lease_returns').get(id)
  if (!lr) return null
  const contact = lr.contactId ? db.collection('contacts').get(lr.contactId) : undefined
  const { label, tone } = toneOf('leaseReturnStatus', lr.status)
  return {
    kind: 'lease_return',
    id: lr.id,
    title: `${lr.assetTag} · ${lr.model ?? 'Lease return'}`,
    subtitle: [label, contact ? displayName(contact) : lr.userId].filter(Boolean).join(' · '),
    status: lr.status,
    tone,
    href: `/lease-returns?lr=${lr.id}`,
    exact,
  }
}

export function search(q: string, limit = 20): SearchResponse {
  const query = q.trim()
  const code = query.toUpperCase()
  const groups: Record<SearchKind, SearchHit[]> = {
    service_request: [],
    lease_return: [],
    asset: [],
    contact: [],
    installation_place: [],
  }
  let exact: SearchHit | null = null
  const srs = db.collection('service_requests')
  const assets = db.collection('assets')

  if (/^SR\d{7}$/.test(code)) {
    const sr = srs.find((s) => s.number === code)
    if (sr) exact = srHit(sr, true)
  } else if (/^TASK\d{7}$/.test(code)) {
    const sr = srs.find((s) => s.taskNumber === code)
    if (sr) exact = srHit(sr, true)
  } else if (/^[A-Z]{2}\d{6}$/.test(code)) {
    const asset = assets.find((a) => a.assetTag === code)
    const lease = db.collection('lease_returns').find((l) => l.assetTag === code)
    if (asset) exact = assetHit(asset.id, true)
    if (lease) {
      const hit = leaseHit(lease.id, !exact)
      if (hit) (exact ? groups.lease_return : groups.lease_return).push(hit)
      if (!exact && hit) exact = hit
    }
  } else if (PLACE.test(code)) {
    const place = PLACE.exec(code)?.[2] ?? code
    const count = assets.count((a) => a.installationPlace === place)
    if (count > 0) {
      exact = {
        kind: 'installation_place',
        id: null,
        title: place,
        subtitle: `${count} device${count === 1 ? '' : 's'} on this place`,
        status: null,
        tone: null,
        href: `/stock/assets?installationPlace=${place}`,
        exact: true,
      }
    }
  }
  if (!exact) {
    const contact = db.collection('contacts').find((c) => c.userId === code)
    if (contact) {
      exact = {
        kind: 'contact',
        id: contact.id,
        title: displayName(contact),
        subtitle: [contact.userId, contact.email].filter(Boolean).join(' · '),
        status: null,
        tone: null,
        href: `/service-requests?contactId=${contact.id}&includeClosed=true`,
        exact: true,
      }
    }
  }
  if (!exact) {
    const asset = assets.find((a) => a.serialNumber === code)
    if (asset) exact = assetHit(asset.id, true)
  }

  // Fuzzy (substring) matches, max 5 per group.
  const needle = query.toLowerCase()
  for (const sr of srs.all()) {
    if (groups.service_request.length >= 5) break
    if (
      sr.number.toLowerCase().includes(needle) ||
      (sr.taskNumber ?? '').toLowerCase().includes(needle)
    ) {
      groups.service_request.push(srHit(sr, false))
    }
  }
  for (const contact of db.collection('contacts').all()) {
    if (groups.contact.length >= 5) break
    const text = `${displayName(contact)} ${contact.email ?? ''} ${contact.userId}`.toLowerCase()
    if (needle.length >= 3 && text.includes(needle)) {
      groups.contact.push({
        kind: 'contact',
        id: contact.id,
        title: displayName(contact),
        subtitle: [contact.userId, contact.email].filter(Boolean).join(' · '),
        status: null,
        tone: null,
        href: `/service-requests?contactId=${contact.id}&includeClosed=true`,
        exact: false,
      })
      for (const sr of srs.filter((s) => s.contactId === contact.id).slice(0, 2)) {
        if (
          groups.service_request.length < 5 &&
          !groups.service_request.some((h) => h.id === sr.id)
        ) {
          groups.service_request.push(srHit(sr, false))
        }
      }
    }
  }
  for (const asset of assets.all()) {
    if (groups.asset.length >= 5) break
    if (
      asset.serialNumber.toLowerCase().includes(needle) ||
      (asset.assetTag ?? '').toLowerCase().includes(needle)
    ) {
      const hit = assetHit(asset.id, false)
      if (hit) groups.asset.push(hit)
    }
  }
  for (const lease of db.collection('lease_returns').all()) {
    if (groups.lease_return.length >= 5) break
    if (lease.assetTag.toLowerCase().includes(needle)) {
      const hit = leaseHit(lease.id, false)
      if (hit && !groups.lease_return.some((h) => h.id === hit.id)) groups.lease_return.push(hit)
    }
  }

  const labels: Record<SearchKind, string> = {
    service_request: 'Service requests',
    lease_return: 'Lease returns',
    asset: 'Assets',
    contact: 'Contacts',
    installation_place: 'Installation places',
  }
  let budget = limit
  const result: SearchResponse['groups'] = []
  for (const kind of Object.keys(groups) as SearchKind[]) {
    const hits = groups[kind].slice(0, Math.max(0, budget))
    budget -= hits.length
    if (hits.length) result.push({ kind, label: labels[kind], hits })
  }
  return { query, exact, groups: result }
}

// ---- action dispatch ----------------------------------------------------------------------------

const RESOURCES: {
  path: string
  resource: Resource
  permission: 'sr.read' | 'lease.read' | 'stock.read'
}[] = [
  { path: '/service-requests', resource: 'serviceRequest', permission: 'sr.read' },
  { path: '/lease-returns', resource: 'leaseReturn', permission: 'lease.read' },
  { path: '/assets', resource: 'asset', permission: 'stock.read' },
]

function detailOf(resource: Resource, id: number, actor: MockActor) {
  if (resource === 'serviceRequest') {
    const row = db.collection('service_requests').get(id)
    return row ? srDetail(row, actor) : null
  }
  if (resource === 'leaseReturn') {
    const row = db.collection('lease_returns').get(id)
    return row ? leaseDetail(row, actor) : null
  }
  const row = db.collection('assets').get(id)
  return row ? assetDetail(row, actor) : null
}

const actionHandlers: RequestHandler[] = RESOURCES.flatMap(({ path, resource, permission }) => [
  http.post(
    apiPath(`${path}/bulk/:action` as `/${string}`),
    authed<{ action: string }>(null, async ({ request, params, actor }) => {
      const body = await readJson<{ ids: number[] } & Record<string, unknown>>(request)
      const ids = Array.isArray(body.ids)
        ? body.ids.filter((id): id is number => typeof id === 'number')
        : []
      const { ids: _ids, ...payload } = body
      void _ids
      const result = applyBulk(resource, params.action, ids, { actor, payload, request })
      return result instanceof Response ? result : HttpResponse.json(result)
    }),
  ),
  http.post(
    apiPath(`${path}/:id/actions/:action` as `/${string}`),
    authed<{ id: string; action: string }>(null, async ({ request, params, actor }) => {
      const id = intParam(params.id)
      if (!id) return problems.notFound(resource, params.id, request)
      if (resource === 'asset' && params.action === 'deactivate') {
        return problem(404, 'unknown_action', 'Unknown action', {
          detail: 'Deactivate via the deactivation import.',
          request,
        })
      }
      const payload = await readJson<Record<string, unknown>>(request)
      const result = applyAction(resource, id, params.action, { actor, payload, request })
      if (!result.ok) return result.response
      return HttpResponse.json(detailOf(resource, id, actor))
    }),
  ),
  http.get(
    apiPath(`${path}/:id` as `/${string}`),
    authed<{ id: string }>(permission, ({ request, params, actor }) => {
      const id = intParam(params.id)
      if (!id) return undefined as unknown as Response // not a numeric id: let other handlers answer
      const detail = detailOf(resource, id, actor)
      return detail ? HttpResponse.json(detail) : problems.notFound(resource, id, request)
    }),
  ),
])

// ---- handlers ----------------------------------------------------------------------------------

export const coreHandlers: RequestHandler[] = [
  // health
  http.get(apiPath('/healthz'), () => HttpResponse.json({ status: 'ok' })),
  http.get(apiPath('/readyz'), () => HttpResponse.json({ status: 'ok', db: 'ok', queue: 'ok' })),

  // auth
  http.post(apiPath('/auth/login'), async ({ request }) => {
    const body = await readJson<{ email: string; password: string }>(request)
    const errors: Record<string, string[]> = {}
    if (!body.email) errors.email = ['Enter an email address.']
    if (!body.password) errors.password = ['Enter your password.']
    if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
    const user = db
      .collection('users')
      .find((u) => u.email.toLowerCase() === String(body.email).trim().toLowerCase())
    if (!user || body.password !== DEMO_PASSWORD) return problems.invalidCredentials(request)
    if (!user.isActive)
      return problem(403, 'account_inactive', 'This account is deactivated.', { request })
    return HttpResponse.json(loginResponse(user.id))
  }),
  http.post(apiPath('/auth/logout'), () => noContent()),
  http.get(apiPath('/auth/personas'), () =>
    listOf(
      db
        .collection('users')
        .filter((u) => u.isDemoPersona && u.isActive)
        .sort((a, b) => (a.personaOrder ?? 99) - (b.personaOrder ?? 99))
        .map(persona),
    ),
  ),
  http.post(apiPath('/auth/persona-login'), async ({ request }) => {
    const body = await readJson<{ email: string }>(request)
    const user = db
      .collection('users')
      .find((u) => u.email === String(body.email ?? '').toLowerCase() && u.isDemoPersona)
    if (!user) return problems.forbidden('Not a demo persona.', request)
    return HttpResponse.json(loginResponse(user.id))
  }),
  http.get(
    apiPath('/me'),
    authed(null, ({ actor }) => {
      const user = db.collection('users').get(actor.id)
      return user ? HttpResponse.json(me(user)) : problems.unauthenticated()
    }),
  ),

  // meta
  http.get(apiPath('/meta/config'), () => {
    const fixture = getFixture().config
    // The browser demo has no SMTP/Mailpit, whatever the fixture was exported with.
    const config: AppConfig = {
      ...fixture,
      today: db.today,
      demoMode: true,
      mailpitUrl: null,
      gateways: { ...fixture.gateways, mailer: 'memory' },
    }
    return HttpResponse.json(config)
  }),
  http.get(
    apiPath('/meta/enums'),
    authed(null, () => HttpResponse.json(servedEnums())),
  ),

  // reference lists
  http.get(
    apiPath('/sites'),
    authed(null, () =>
      listOf(
        db
          .collection('sites')
          .all()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(site),
      ),
    ),
  ),
  http.get(
    apiPath('/regions'),
    authed('master.read', ({ request }) => {
      const active = new URL(request.url).searchParams.get('active') ?? 'true'
      return listOf(
        db
          .collection('regions')
          .all()
          .filter((r) => active === 'all' || r.isActive === (active === 'true'))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
          .map((r) => region(r.id))
          .filter((r) => r !== null),
      )
    }),
  ),
  http.get(
    apiPath('/stock-locations'),
    authed(null, ({ request }) => {
      const params = new URL(request.url).searchParams
      const siteId = intParam(params.get('siteId') ?? undefined)
      const types = multiValue(params, 'type')
      return listOf(
        db
          .collection('stock_locations')
          .all()
          .filter(
            (l) =>
              (siteId === undefined || l.siteId === siteId) &&
              (types.length === 0 || types.includes(l.type)),
          )
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((l) => stockLocation(l.id))
          .filter((l) => l !== null),
      )
    }),
  ),
  http.get(
    apiPath('/users'),
    authed('users.read', ({ request }) => {
      const params = new URL(request.url).searchParams
      const roles = multiValue(params, 'role')
      const active = params.get('active') ?? 'true'
      const q = params.get('q')?.trim().toLowerCase()
      return listOf(
        db
          .collection('users')
          .all()
          .filter((u) => roles.length === 0 || roles.includes(u.role))
          .filter((u) => active === 'all' || u.isActive === (active === 'true'))
          .filter((u) => !q || `${displayName(u)} ${u.email}`.toLowerCase().includes(q))
          .sort((a, b) => a.lastName.localeCompare(b.lastName))
          .map(userSummary),
      )
    }),
  ),
  http.get(
    apiPath('/deviation-codes'),
    authed(null, ({ request }) => {
      const active = new URL(request.url).searchParams.get('active') ?? 'true'
      return listOf(
        db
          .collection('deviation_codes')
          .all()
          .filter((d) => active === 'all' || d.isActive === (active === 'true'))
          .sort((a, b) => a.sortOrder - b.sortOrder),
      )
    }),
  ),

  // search
  http.get(
    apiPath('/search'),
    authed(null, ({ request }) => {
      const params = new URL(request.url).searchParams
      const q = params.get('q')?.trim() ?? ''
      if (q.length < 2)
        return problems.validation({ q: ['Type at least 2 characters.'] }, undefined, request)
      return HttpResponse.json(search(q, Number(params.get('limit')) || 20))
    }),
  ),

  // saved views
  http.get(
    apiPath('/saved-views'),
    authed(null, ({ request, actor }) => {
      const route = new URL(request.url).searchParams.get('route')
      const rows = db
        .collection('saved_views')
        .filter((v) => (!route || v.route === route) && (v.userId === actor.id || v.isShared))
        .sort(
          (a, b) =>
            Number(a.isShared) - Number(b.isShared) ||
            a.sortOrder - b.sortOrder ||
            a.name.localeCompare(b.name),
        )
      return listOf(rows.map((row) => savedView(row, actor)))
    }),
  ),
  http.post(
    apiPath('/saved-views'),
    authed(null, async ({ request, actor }) => {
      const body = await readJson<SavedViewCreate>(request)
      const errors: Record<string, string[]> = {}
      if (!body.route) errors.route = ['Missing route.']
      if (!body.name?.trim()) errors.name = ['Name the view.']
      if (typeof body.search !== 'object' || body.search === null)
        errors.search = ['Missing search.']
      if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
      if (body.isShared && !['dispatcher', 'admin'].includes(actor.role)) {
        return problems.forbidden('Only dispatchers and admins can share views.', request)
      }
      const views = db.collection('saved_views')
      if (
        views.find(
          (v) => v.userId === actor.id && v.route === body.route && v.name === body.name?.trim(),
        )
      ) {
        return problems.duplicate('You already have a view with this name.', request)
      }
      const row = views.insert({
        userId: actor.id,
        route: body.route ?? '/',
        name: body.name?.trim() ?? '',
        search: body.search ?? {},
        isShared: body.isShared ?? false,
        sortOrder: body.sortOrder ?? views.count((v) => v.userId === actor.id) + 1,
        createdAt: new Date().toISOString(),
      })
      return HttpResponse.json(savedView(row, actor), { status: 201 })
    }),
  ),
  http.patch(
    apiPath('/saved-views/:id'),
    authed<{ id: string }>(null, async ({ request, params, actor }) => {
      const views = db.collection('saved_views')
      const row = views.get(intParam(params.id))
      if (!row) return problems.notFound('Saved view', params.id, request)
      if (row.userId !== actor.id)
        return problems.forbidden('Only the owner can change this view.', request)
      const body = await readJson<SavedViewCreate>(request)
      const updated = views.update(row.id, {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.search !== undefined && { search: body.search }),
        ...(body.isShared !== undefined && { isShared: body.isShared }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      })
      return updated
        ? HttpResponse.json(savedView(updated, actor))
        : problems.notFound('Saved view', params.id, request)
    }),
  ),
  http.delete(
    apiPath('/saved-views/:id'),
    authed<{ id: string }>(null, ({ request, params, actor }) => {
      const views = db.collection('saved_views')
      const row = views.get(intParam(params.id))
      if (!row) return problems.notFound('Saved view', params.id, request)
      if (row.userId !== actor.id && !(row.isShared && actor.role === 'admin')) {
        return problems.forbidden('Only the owner can delete this view.', request)
      }
      views.remove(row.id)
      return noContent()
    }),
  ),

  // files
  http.get(apiPath('/files/:id/download'), ({ params, request }) =>
    serveFile(intParam(params.id as string) ?? 0, request),
  ),

  // jobs
  http.get(
    apiPath('/jobs/:id'),
    authed<{ id: string }>(null, ({ params, request }) => {
      const row = advanceJob(intParam(params.id) ?? 0)
      return row
        ? HttpResponse.json(serializeJob(row))
        : problems.notFound('Job', params.id, request)
    }),
  ),
  http.get(
    apiPath('/jobs'),
    authed(null, ({ request, actor }) => {
      const params = new URL(request.url).searchParams
      const mine = params.get('mine') === 'true'
      const statuses = multiValue(params, 'status') as JobStatus[]
      const kinds = multiValue(params, 'kind') as JobKind[]
      const rows = db
        .collection('background_jobs')
        .all()
        .map((row) => advanceJob(row.id) ?? row)
        .filter(
          (row) =>
            (!mine || row.createdBy === actor.id) &&
            (statuses.length === 0 || statuses.includes(row.status)),
        )
        .filter((row) => kinds.length === 0 || kinds.includes(row.kind))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return listOf(rows.map(serializeJob))
    }),
  ),

  // demo reset (SPEC_RESOLUTIONS #48: the job keeps its own row)
  http.post(
    apiPath('/demo/reset'),
    authed('demo.reset', ({ actor }) => {
      const accepted = startJob({
        kind: 'demo_reset',
        actor,
        durationMs: 1200,
        run: () => {
          const job = db.collection('background_jobs').get(accepted.jobId)
          db.reset()
          if (job) db.collection('background_jobs').upsert({ ...job, status: 'running' })
          return { kind: 'demo_reset', seededAt: new Date().toISOString() }
        },
      })
      return HttpResponse.json(accepted, { status: 202 })
    }),
  ),

  // Appointment sync state for the top-bar indicator (API.md §7.1). A read-only default so the
  // shell works before H4 exists; H4 registers its own handler (slice handlers come first).
  http.get(
    apiPath('/appointments/sync-state'),
    authed('appointments.read', () => {
      const now = Date.now()
      const minutes = (n: number) => new Date(now + n * 60_000).toISOString()
      const state: SyncState = {
        running: false,
        lastJobId: null,
        lastIncrementalSyncAt: minutes(-6),
        lastFullSyncAt: `${db.today}T03:00:00Z`,
        lastResult: {
          calendars: db.collection('booking_calendars').count(),
          created: 0,
          updated: 0,
          cancelled: 0,
          matched: 0,
          unmatched: 0,
          transitions: 0,
        },
        nextScheduledAt: minutes(9),
      }
      return HttpResponse.json(state)
    }),
  ),

  ...actionHandlers,
]

/** For tests and slices: the actor of a request (or null). */
export { actorFromRequest, actorForUser }
