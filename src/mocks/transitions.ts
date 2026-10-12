import { problem } from './http'

/**
 * Explicit status machines for mock resources: which actions exist, from which statuses,
 * with which permission. Mirrors the backend so the mock API returns the same
 * `availableActions` and the same 403/409 problems.
 *
 *   export const srMachine = defineMachine<ServiceRequestRecord, 'status'>()({
 *     statusKey: 'status',
 *     transitions: {
 *       claim: { from: ['appointment_booked'], to: 'personalization_in_progress', permission: 'staging:write' },
 *       cancel: { from: '*', to: 'cancelled', permission: 'requests:write',
 *                 guard: (sr) => (sr.status === 'completed' ? 'Completed requests cannot be cancelled.' : null) },
 *     },
 *   })
 *
 *   srMachine.availableActions(sr, ctx)          // ['claim', 'cancel']
 *   const result = srMachine.apply(sr, 'claim', ctx)
 *   if (!result.ok) return result.response       // problem+json 403 / 409
 *   db.collection('serviceRequests').update(sr.id, result.patch)
 */

export interface ActionContext {
  /** Permission check for the requesting user (phase 2b provides it from the mock session). */
  can: (permission: string) => boolean
}

/** Context that allows everything (seeding, tests). */
export const SYSTEM_CONTEXT: ActionContext = { can: () => true }

export interface TransitionDef<TRecord, TStatus extends string> {
  from: readonly TStatus[] | '*'
  to: TStatus | ((record: TRecord) => TStatus)
  permission?: string
  /** Extra business rule; return a reason string to block the transition (409). */
  guard?: (record: TRecord, ctx: ActionContext) => string | null | undefined
  /** Extra fields to set alongside the status (timestamps, assignee, ...). */
  effect?: (record: TRecord, ctx: ActionContext) => Partial<TRecord>
}

export type TransitionResult<TRecord> =
  | { ok: true; patch: Partial<TRecord> }
  | { ok: false; status: 403 | 409 | 422; title: string; detail: string; response: Response }

export interface Machine<TRecord, TAction extends string> {
  readonly actions: readonly TAction[]
  availableActions(record: TRecord, ctx: ActionContext): TAction[]
  can(record: TRecord, action: TAction, ctx: ActionContext): boolean
  apply(record: TRecord, action: string, ctx: ActionContext): TransitionResult<TRecord>
}

type StatusOf<TRecord, K extends keyof TRecord> = Extract<TRecord[K], string>

function fail<TRecord>(
  status: 403 | 409 | 422,
  title: string,
  detail: string,
): TransitionResult<TRecord> {
  return { ok: false, status, title, detail, response: problem(status, title, { detail }) }
}

/** Curried so the record type is explicit and the action names are inferred. */
export function defineMachine<TRecord, K extends keyof TRecord>() {
  return <TAction extends string>(config: {
    statusKey: K
    transitions: Record<TAction, TransitionDef<TRecord, StatusOf<TRecord, K>>>
  }): Machine<TRecord, TAction> => {
    const { statusKey, transitions } = config
    const actions = Object.keys(transitions) as TAction[]

    const check = (
      record: TRecord,
      action: string,
      ctx: ActionContext,
    ): TransitionResult<TRecord> => {
      if (!Object.hasOwn(transitions, action)) {
        return fail(422, 'Unknown action', `"${action}" is not a valid action.`)
      }
      const def = transitions[action as TAction]
      const current = record[statusKey] as StatusOf<TRecord, K>
      if (def.permission && !ctx.can(def.permission)) {
        return fail(
          403,
          'Not allowed',
          `You do not have permission to ${action.replace(/_/g, ' ')}.`,
        )
      }
      if (def.from !== '*' && !def.from.includes(current)) {
        return fail(
          409,
          'Invalid transition',
          `Cannot ${action.replace(/_/g, ' ')} from status "${current}".`,
        )
      }
      const blocked = def.guard?.(record, ctx)
      if (blocked) return fail(409, 'Action not possible', blocked)
      const to = typeof def.to === 'function' ? def.to(record) : def.to
      return {
        ok: true,
        patch: { ...def.effect?.(record, ctx), [statusKey]: to },
      }
    }

    return {
      actions,
      availableActions: (record, ctx) => actions.filter((action) => check(record, action, ctx).ok),
      can: (record, action, ctx) => check(record, action, ctx).ok,
      apply: check,
    }
  }
}
