import { use } from 'react'
import type { EnumsResponse, EnumValue, Tone, TransitionDef } from '@/lib/api/types'
import { ENUM_CATALOG } from './catalog'
import { EnumsContext } from './context'

/**
 * Enum labels, tones and transition metadata come from `GET /meta/enums` (cached forever per
 * session), provided once by `EnumsProvider`. The static `ENUM_CATALOG` (same content, SPEC §4)
 * is the placeholder until it has loaded, so badges never flash raw keys.
 */
export type EnumKey = Exclude<keyof EnumsResponse, 'transitions' | 'permissions'>
export type WorkflowResource = keyof EnumsResponse['transitions']

export function useEnums(): EnumsResponse {
  return use(EnumsContext) ?? ENUM_CATALOG
}

type EnumIndex = Map<EnumKey, Map<string, EnumValue>>
const indexes = new WeakMap<EnumsResponse, EnumIndex>()

/** Value lookup by key in O(1); the index is built once per enums payload. */
function indexOf(enums: EnumsResponse): EnumIndex {
  let index = indexes.get(enums)
  if (!index) {
    index = new Map()
    for (const [key, values] of Object.entries(enums)) {
      if (key === 'transitions' || key === 'permissions' || !Array.isArray(values)) continue
      index.set(
        key as EnumKey,
        new Map((values as EnumValue[]).map((entry) => [entry.value, entry])),
      )
    }
    indexes.set(enums, index)
  }
  return index
}

export function findEnumValue(
  enums: EnumsResponse,
  key: EnumKey,
  value: string | null | undefined,
): EnumValue | undefined {
  if (value === null || value === undefined) return undefined
  return indexOf(enums).get(key)?.get(value)
}

/** Label for an enum value (falls back to the raw value in sentence case). */
export function enumLabel(
  enums: EnumsResponse,
  key: EnumKey,
  value: string | null | undefined,
): string {
  if (value === null || value === undefined) return '—'
  return findEnumValue(enums, key, value)?.label ?? humanize(value)
}

export function enumTone(
  enums: EnumsResponse,
  key: EnumKey,
  value: string | null | undefined,
): Tone | null {
  return findEnumValue(enums, key, value)?.tone ?? null
}

/** Hook form: `const label = useEnumLabel('deliveryType', sr.deliveryType)`. */
export function useEnumLabel(key: EnumKey, value: string | null | undefined): string {
  return enumLabel(useEnums(), key, value)
}

export function humanize(value: string): string {
  const text = value.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function findTransition(
  enums: EnumsResponse,
  resource: WorkflowResource,
  action: string,
): TransitionDef | undefined {
  return enums.transitions[resource].find((transition) => transition.action === action)
}

/** Button label of a workflow action (API.md §3.3 exact labels). */
export function actionLabel(
  enums: EnumsResponse,
  resource: WorkflowResource,
  action: string,
): string {
  return findTransition(enums, resource, action)?.label ?? humanize(action)
}

export { ENUM_CATALOG }
