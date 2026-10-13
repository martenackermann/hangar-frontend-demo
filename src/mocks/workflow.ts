import type { BlockedAction, BulkResult, Trigger, TransitionDef } from '@/lib/api/types'
import type { PermissionKey } from '@/lib/enums/catalog'
import { businessToday } from '@/lib/format'
import type { MockActor } from './auth'
import { db, type BaseRecord } from './db'
import { servedEnums } from './core/fixture'
import { problem, problemInfo, problems } from './http'

/**
 * Workflow engine of the mock API — the MSW twin of the backend's TransitionService +
 * ActionRegistry (SPEC §2.4, §4; SPEC_RESOLUTIONS #2, #3, #4, #15, #34).
 *
 * The transition maps are defined ONCE: the served `/meta/enums.transitions` (`servedEnums()`:
 * the fixture's enums, i.e. the backend's when imported, else `ENUM_CATALOG`). Core registers the guards/effects that only touch core tables
 * (`src/mocks/core/workflow.ts`); slices register theirs in `src/modules/<m>/mocks/workflow.ts`:
 *
 *   registerGuard('serviceRequest', 'book_appointment', ({ payload }) =>
 *     calendarEnabled(payload.calendarId) ? null : { code: 'calendar_enabled', message: 'The calendar is disabled.' })
 *   registerEffect('serviceRequest', 'claim', ({ row, actor, update }) => update({ editorUserId: actor?.id ?? null }))
 *   registerResolver('serviceRequest', 'send_next_mail', ({ row }) => ({ to: nextChainStatus(row), action: … }))
 *   registerAuthorizer('serviceRequest', 'complete_deployment', ({ row, actor }) => ownsTour(row, actor))
 *
 * `apply()` order: unknown action 404 → permission 403 → authorizer 403 `not_own_tour` →
 * status 409 `transition_not_allowed` (+ allowedActions) → version 409 `version_conflict` →
 * required comment 422 → guards 409 `guard_failed` → resolve target → write status,
 * statusChangedAt, version+1, `status_transitions` row → effects → subscribers.
 */

export type Resource = 'serviceRequest' | 'leaseReturn' | 'asset'

export interface WorkflowRow extends BaseRecord {
  status: string
  statusChangedAt: string
  version: number
}

const TABLES: Record<Resource, string> = {
  serviceRequest: 'service_requests',
  leaseReturn: 'lease_returns',
  asset: 'assets',
}

const ENTITY_TYPES: Record<Resource, 'service_request' | 'lease_return' | 'asset'> = {
  serviceRequest: 'service_request',
  leaseReturn: 'lease_return',
  asset: 'asset',
}

export interface ActionContext<R extends WorkflowRow = WorkflowRow> {
  resource: Resource
  action: string
  row: R
  actor: MockActor | null
  trigger: Trigger
  payload: Record<string, unknown>
  comment: string | null
  /** Business date. */
  today: string
  now: string
}

export interface GuardFailure {
  code: string
  message: string
}

export type Guard<R extends WorkflowRow = WorkflowRow> = (
  ctx: ActionContext<R>,
) => GuardFailure | null | undefined
export type Authorizer<R extends WorkflowRow = WorkflowRow> = (ctx: ActionContext<R>) => boolean
/** Computed target: `to: null` = status unchanged (pause/resume); `action` = resolved action name. */
export type Resolver<R extends WorkflowRow = WorkflowRow> = (
  ctx: ActionContext<R>,
) => { to: string | null; action?: string } | GuardFailure

export interface EffectContext<R extends WorkflowRow = WorkflowRow> extends ActionContext<R> {
  from: string
  to: string
  /** The row after the status write (re-read it after `update`). */
  updated: R
  /** Patch this row (version is not bumped again). */
  update: (patch: Partial<R>) => R
}
export type Effect<R extends WorkflowRow = WorkflowRow> = (ctx: EffectContext<R>) => void
/** Payload validation → 422 field errors (SPEC_RESOLUTIONS #34), e.g. a missing `reason`. */
export type Validator<R extends WorkflowRow = WorkflowRow> = (
  ctx: ActionContext<R>,
) => Record<string, string[]> | null | undefined

interface Registry {
  validators: Map<string, Validator[]>
  guards: Map<string, { guard: Guard; triggers?: readonly Trigger[] | undefined }[]>
  authorizers: Map<string, Authorizer[]>
  resolvers: Map<string, Resolver>
  effects: Map<string, Effect[]>
  subscribers: Effect[]
}

const registries: Record<Resource, Registry> = {
  serviceRequest: {
    validators: new Map(),
    guards: new Map(),
    authorizers: new Map(),
    resolvers: new Map(),
    effects: new Map(),
    subscribers: [],
  },
  leaseReturn: {
    validators: new Map(),
    guards: new Map(),
    authorizers: new Map(),
    resolvers: new Map(),
    effects: new Map(),
    subscribers: [],
  },
  asset: {
    validators: new Map(),
    guards: new Map(),
    authorizers: new Map(),
    resolvers: new Map(),
    effects: new Map(),
    subscribers: [],
  },
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  map.set(key, [...(map.get(key) ?? []), value])
}

/** Payload validation for one action (422 with field errors). */
export function registerValidator<R extends WorkflowRow>(
  resource: Resource,
  action: string,
  fn: Validator<R>,
): void {
  push(registries[resource].validators, action, fn as unknown as Validator)
}

/** Guard for one action. `triggers` limits it (e.g. `['job']` for chain_due/not_paused). */
export function registerGuard<R extends WorkflowRow>(
  resource: Resource,
  action: string,
  guard: Guard<R>,
  options: { triggers?: readonly Trigger[] } = {},
): void {
  push(registries[resource].guards, action, {
    guard: guard as unknown as Guard,
    triggers: options.triggers,
  })
}

/** Hides the action (and returns 403 `not_own_tour`) when false (SPEC_RESOLUTIONS #2). */
export function registerAuthorizer<R extends WorkflowRow>(
  resource: Resource,
  action: string,
  fn: Authorizer<R>,
): void {
  push(registries[resource].authorizers, action, fn as unknown as Authorizer)
}

/**
 * Computed target status: required for `to: null` actions, optional otherwise (e.g. booking from
 * `reschedule_needed` resumes `resumeStatus`). Replaces an earlier resolver for the action.
 */
export function registerResolver<R extends WorkflowRow>(
  resource: Resource,
  action: string,
  fn: Resolver<R>,
): void {
  registries[resource].resolvers.set(action, fn as unknown as Resolver)
}

/** Side effect of one action, after the status write. */
export function registerEffect<R extends WorkflowRow>(
  resource: Resource,
  action: string,
  effect: Effect<R>,
): void {
  push(registries[resource].effects, action, effect as unknown as Effect)
}

/** Runs after every applied transition of the resource (filter on `ctx.to` / `ctx.action`). */
export function onTransition<R extends WorkflowRow>(resource: Resource, effect: Effect<R>): void {
  registries[resource].subscribers.push(effect as unknown as Effect)
}

/** The transition map as served by `/meta/enums` (backend export or static catalog). */
export function transitionsOf(resource: Resource): readonly TransitionDef[] {
  return servedEnums().transitions[resource]
}

export function findDef(resource: Resource, action: string): TransitionDef | undefined {
  return transitionsOf(resource).find((def) => def.action === action)
}

function context<R extends WorkflowRow>(
  resource: Resource,
  action: string,
  row: R,
  actor: MockActor | null,
  trigger: Trigger,
  payload: Record<string, unknown> = {},
): ActionContext<R> {
  const comment =
    typeof payload.comment === 'string' && payload.comment.trim() ? payload.comment.trim() : null
  return {
    resource,
    action,
    row,
    actor,
    trigger,
    payload,
    comment,
    today: businessToday(),
    now: new Date().toISOString(),
  }
}

function hasPerm(actor: MockActor | null, permission: string | null): boolean {
  return permission === null || (actor?.permissions.includes(permission as PermissionKey) ?? false)
}

function runGuards(resource: Resource, ctx: ActionContext): GuardFailure | null {
  for (const { guard, triggers } of registries[resource].guards.get(ctx.action) ?? []) {
    if (triggers && !triggers.includes(ctx.trigger)) continue
    const failure = guard(ctx)
    if (failure) return failure
  }
  return null
}

function authorized(resource: Resource, ctx: ActionContext): boolean {
  return (registries[resource].authorizers.get(ctx.action) ?? []).every((fn) => fn(ctx))
}

/** Executable without a slice? Computed targets need a registered resolver. */
function executable(resource: Resource, def: TransitionDef): boolean {
  return def.to !== null || registries[resource].resolvers.has(def.action)
}

/**
 * `availableActions` + `blockedActions` for the current user (API.md §1.5): status allows +
 * permission + authorizer; guards failing → blocked with reason.
 */
export function evaluateActions(
  resource: Resource,
  row: WorkflowRow,
  actor: MockActor | null,
): { availableActions: string[]; blockedActions: BlockedAction[] } {
  const available: string[] = []
  const blocked: BlockedAction[] = []
  for (const def of transitionsOf(resource)) {
    if (def.internal || !def.triggers.includes('user') || !def.from.includes(row.status)) continue
    if (!hasPerm(actor, def.permission) || !executable(resource, def)) continue
    const ctx = context(resource, def.action, row, actor, 'user')
    if (!authorized(resource, ctx)) continue
    const failure = runGuards(resource, ctx)
    if (failure) blocked.push({ action: def.action, guard: failure.code, reason: failure.message })
    else available.push(def.action)
  }
  return { availableActions: available, blockedActions: blocked }
}

export type ApplyResult<R extends WorkflowRow> =
  { ok: true; row: R } | { ok: false; response: Response }

export interface ApplyOptions {
  actor: MockActor | null
  trigger?: Trigger
  payload?: Record<string, unknown>
  request?: Request
}

/** Apply one action to one row (one "transaction"). */
export function applyAction<R extends WorkflowRow>(
  resource: Resource,
  id: number,
  action: string,
  { actor, trigger = 'user', payload = {}, request }: ApplyOptions,
): ApplyResult<R> {
  const table = db.table<R>(TABLES[resource])
  const row = table.get(id)
  if (!row) return { ok: false, response: problems.notFound(resource, id, request) }
  const def = findDef(resource, action)
  if (!def?.triggers.includes(trigger) || (trigger === 'user' && def.internal)) {
    return {
      ok: false,
      response: problem(404, 'unknown_action', 'Unknown action', {
        detail: `"${action}" is not an action of this resource.`,
        request,
      }),
    }
  }
  if (trigger === 'user' && !hasPerm(actor, def.permission)) {
    return {
      ok: false,
      response: problems.forbidden(`Your role can't ${def.label.toLowerCase()}.`, request),
    }
  }
  const ctx = context(resource, action, row, actor, trigger, payload)
  if (trigger === 'user' && !authorized(resource, ctx)) {
    return {
      ok: false,
      response: problem(403, 'not_own_tour', 'Not your tour', {
        detail: 'This stop belongs to another technician.',
        request,
      }),
    }
  }
  if (!def.from.includes(row.status)) {
    const allowed = evaluateActions(resource, row, actor).availableActions
    return {
      ok: false,
      response: problem(409, 'transition_not_allowed', 'Action not possible', {
        detail: `${def.label} is not possible in status "${row.status}".`,
        allowedActions: allowed,
        request,
      }),
    }
  }
  if (typeof payload.version === 'number' && payload.version !== row.version) {
    return {
      ok: false,
      response: problem(409, 'version_conflict', 'This record changed', {
        detail: 'Someone else updated it. Reload and try again.',
        currentVersion: row.version,
        request,
      }),
    }
  }
  if (def.requiresComment && !ctx.comment) {
    return {
      ok: false,
      response: problems.validation({ comment: ['A comment is required.'] }, undefined, request),
    }
  }
  for (const validate of registries[resource].validators.get(action) ?? []) {
    const errors = validate(ctx)
    if (errors && Object.keys(errors).length > 0) {
      return { ok: false, response: problems.validation(errors, undefined, request) }
    }
  }
  const failure = runGuards(resource, ctx)
  if (failure) {
    return {
      ok: false,
      response: problem(409, 'guard_failed', 'Action not possible', {
        detail: failure.message,
        guard: failure,
        request,
      }),
    }
  }
  let to = def.to
  let resolvedAction = action
  const resolver = registries[resource].resolvers.get(action)
  if (to === null && !resolver) {
    return {
      ok: false,
      response: problems.notImplemented(
        `"${action}" is built by ${def.owner.toUpperCase()}.`,
        request,
      ),
    }
  }
  if (resolver) {
    const resolved = resolver(ctx)
    if ('code' in resolved) {
      return {
        ok: false,
        response: problem(409, 'guard_failed', 'Action not possible', {
          detail: resolved.message,
          guard: resolved,
          request,
        }),
      }
    }
    to = resolved.to ?? row.status
    resolvedAction = resolved.action ?? action
  }

  const from = row.status
  const target = to ?? from
  const now = ctx.now
  let updated = table.update(row.id, {
    status: target,
    ...(target !== from ? { statusChangedAt: now } : {}),
    version: row.version + 1,
  } as Partial<R>)!
  if (resource !== 'asset') {
    db.collection('status_transitions').insert({
      entityType: ENTITY_TYPES[resource] as 'service_request' | 'lease_return',
      entityId: row.id,
      action: resolvedAction,
      fromStatus: from,
      toStatus: target,
      actorUserId: actor?.id ?? null,
      trigger,
      comment: ctx.comment,
      payload: Object.keys(payload).length ? payload : null,
      occurredAt: now,
    })
  }
  const update = (patch: Partial<R>): R => {
    updated = table.update(row.id, patch)!
    return updated
  }
  const effectCtx: EffectContext<R> = {
    ...ctx,
    action: resolvedAction,
    from,
    to: target,
    updated,
    update,
  }
  for (const effect of [
    ...(registries[resource].effects.get(action) ?? []),
    ...(resolvedAction !== action ? (registries[resource].effects.get(resolvedAction) ?? []) : []),
    ...registries[resource].subscribers,
  ]) {
    effect({ ...effectCtx, updated } as unknown as EffectContext)
  }
  return { ok: true, row: table.get(row.id)! }
}

/** `POST /<resource>/bulk/{action}`: each id in its own "transaction" (API.md §1.5). */
export function applyBulk(
  resource: Resource,
  action: string,
  ids: readonly number[],
  options: ApplyOptions,
): BulkResult | Response {
  const def = findDef(resource, action)
  if (!def)
    return problem(404, 'unknown_action', 'Unknown action', {
      detail: `"${action}" is not an action.`,
      request: options.request,
    })
  if (!def.bulk)
    return problems.badRequest(`${def.label} is not available as a bulk action.`, options.request)
  if (ids.length < 1 || ids.length > 200)
    return problems.validation({ ids: ['Select 1–200 records.'] }, undefined, options.request)
  const succeeded: number[] = []
  const failed: BulkResult['failed'] = []
  for (const id of ids) {
    const result = applyAction(resource, id, action, options)
    if (result.ok) succeeded.push(id)
    else {
      const body = problemInfo(result.response)
      failed.push({ id, code: body.code, message: body.detail ?? body.title })
    }
  }
  return { action, succeeded, failed }
}
