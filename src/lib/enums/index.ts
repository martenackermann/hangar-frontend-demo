import { useQuery } from '@tanstack/react-query'
import { coreQueries } from '@/lib/api/core'
import type { EnumsResponse, EnumValue, Tone, TransitionDef } from '@/lib/api/types'
import { ENUM_CATALOG } from './catalog'

/**
 * Enum labels, tones and transition metadata come from `GET /meta/enums` (cached forever per
 * session). The static `ENUM_CATALOG` (same content, SPEC §4) is the placeholder until it has
 * loaded, so badges never flash raw keys.
 */
export type EnumKey = Exclude<keyof EnumsResponse, 'transitions' | 'permissions'>
export type WorkflowResource = keyof EnumsResponse['transitions']

export function useEnums(): EnumsResponse {
  const { data } = useQuery({ ...coreQueries.enums(), placeholderData: ENUM_CATALOG })
  return data ?? ENUM_CATALOG
}

export function findEnumValue(
  enums: EnumsResponse,
  key: EnumKey,
  value: string | null | undefined,
): EnumValue | undefined {
  if (value === null || value === undefined) return undefined
  return enums[key].find((entry) => entry.value === value)
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
