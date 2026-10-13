import type { DeliveryType, ProcurementType, RegionRuleMatchKind } from '@/lib/api/types'
import { db } from '@/mocks/db'
import type { RegionRow, RegionRuleRow, ServiceRequestRow } from '@/mocks/core/tables'

/**
 * Region resolver (SPEC §6.1, SPEC_RESOLUTIONS #29/#40/#54), a port of the backend's
 * `app/core/region_resolver.py` for the mock import engine, the rule tester and reapply.
 */
const KIND_RANK: Record<RegionRuleMatchKind, number> = {
  cost_center: 4,
  zip: 3,
  zip_prefix: 2,
  city: 1,
}

/** Statuses whose region/items may still change (SPEC_RESOLUTIONS #29). */
export const REGION_MUTABLE_STATUSES = new Set<string>([
  'imported',
  'imported_vip',
  'hardware_unavailable',
  'invited',
  'campus_info_sent',
  'reminder_1_sent',
  'reminder_2_sent',
  'escalated',
])

export interface NormalizedInput {
  zip: string | null
  city: string | null
  costCenter: string | null
}

export function normalizeZip(value: string | null | undefined): string | null {
  if (!value) return null
  let digits = value.replace(/\D/g, '')
  if (digits.length === 4) digits = `0${digits}`
  return digits.length === 5 ? digits : null
}

export function normalizeCity(value: string | null | undefined): string | null {
  if (!value) return null
  const cleaned = value.trim().replace(/\s+/g, ' ').toLowerCase()
  return cleaned || null
}

export function normalizeCostCenter(value: string | null | undefined): string | null {
  if (!value) return null
  return value.trim().toUpperCase() || null
}

export function normalizePattern(kind: RegionRuleMatchKind, pattern: string): string {
  if (kind === 'zip' || kind === 'zip_prefix') return pattern.replace(/\D/g, '')
  if (kind === 'city') return normalizeCity(pattern) ?? ''
  return normalizeCostCenter(pattern) ?? ''
}

function rankKey(rule: RegionRuleRow): number[] {
  return [
    rule.procurementType !== null ? 0 : 1,
    -KIND_RANK[rule.matchKind],
    rule.matchKind === 'zip_prefix' ? -rule.pattern.length : 0,
    -rule.priority,
    rule.id,
  ]
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function candidateRules(input: {
  zip?: string | null
  city?: string | null
  costCenter?: string | null
  procurementType?: ProcurementType | null
}): { normalized: NormalizedInput; rules: RegionRuleRow[] } {
  const normalized: NormalizedInput = {
    zip: normalizeZip(input.zip),
    city: normalizeCity(input.city),
    costCenter: normalizeCostCenter(input.costCenter),
  }
  const regions = new Map(
    db
      .collection('regions')
      .all()
      .map((r) => [r.id, r]),
  )
  const rules = db.collection('region_rules').filter((rule) => {
    if (!rule.isActive || !regions.get(rule.regionId)?.isActive) return false
    if (rule.procurementType !== null && rule.procurementType !== (input.procurementType ?? null))
      return false
    switch (rule.matchKind) {
      case 'cost_center':
        return normalized.costCenter !== null && rule.pattern === normalized.costCenter
      case 'zip':
        return normalized.zip !== null && rule.pattern === normalized.zip
      case 'zip_prefix':
        return normalized.zip?.startsWith(rule.pattern) ?? false
      case 'city':
        return normalized.city !== null && rule.pattern === normalized.city
    }
  })
  rules.sort((a, b) => compareKeys(rankKey(a), rankKey(b)))
  return { normalized, rules }
}

export interface Resolution {
  region: RegionRow
  rule: RegionRuleRow
  deliveryType: DeliveryType
  isCampus: boolean
}

export function deliveryFor(
  rule: RegionRuleRow | null,
  region: RegionRow,
  procurementType: ProcurementType | null,
  isCampus: boolean,
): DeliveryType {
  if (isCampus || procurementType === 'removal') return 'technician'
  return rule?.deliveryType ?? region.defaultDeliveryType
}

export function resolveRegion(input: {
  zip?: string | null
  city?: string | null
  costCenter?: string | null
  procurementType?: ProcurementType | null
}): Resolution | null {
  const { rules } = candidateRules(input)
  const rule = rules[0]
  if (!rule) return null
  const region = db.collection('regions').get(rule.regionId)
  if (!region) return null
  return {
    region,
    rule,
    deliveryType: deliveryFor(rule, region, input.procurementType ?? null, rule.isCampus),
    isCampus: rule.isCampus,
  }
}

/** Region columns for an SR (`apply_region`); `null` = skip (overridden / not mutable). */
export function regionColumns(
  sr: Pick<
    ServiceRequestRow,
    | 'deliveryZip'
    | 'deliveryCity'
    | 'costCenter'
    | 'procurementType'
    | 'regionOverridden'
    | 'status'
  >,
  force = false,
): Pick<
  ServiceRequestRow,
  'regionId' | 'regionRuleId' | 'supplyingSiteId' | 'deliveryType' | 'isCampus'
> | null {
  if (sr.regionOverridden) return null
  if (!force && sr.status && !REGION_MUTABLE_STATUSES.has(sr.status)) return null
  const resolution = resolveRegion({
    zip: sr.deliveryZip,
    city: sr.deliveryCity,
    costCenter: sr.costCenter,
    procurementType: sr.procurementType,
  })
  if (!resolution) {
    return {
      regionId: null,
      regionRuleId: null,
      supplyingSiteId: null,
      deliveryType: null,
      isCampus: false,
    }
  }
  return {
    regionId: resolution.region.id,
    regionRuleId: resolution.rule.id,
    supplyingSiteId: resolution.region.supplyingSiteId,
    deliveryType: resolution.deliveryType,
    isCampus: resolution.isCampus,
  }
}

/** Lease `is_campus` from the contact's address + the lease cost centre (`apply_lease_campus`). */
export function leaseIsCampus(contactId: number | null, costCenter: string | null): boolean {
  const contact = contactId ? db.collection('contacts').get(contactId) : undefined
  return Boolean(
    resolveRegion({ zip: contact?.zip, city: contact?.city, costCenter, procurementType: null })
      ?.isCampus,
  )
}
