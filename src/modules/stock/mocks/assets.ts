import { db } from '@/mocks/db'
import type { AssetRow } from '@/mocks/fixtures/types'
import { csv } from '@/mocks/files'
import { problems } from '@/mocks/http'
import { filterBool, filterFrom, filterIn, filterTo, multiValue, type FilterFn } from '@/mocks/list'
import { docDateTime, label, locationMap, normalizePlace } from './common'

/** `GET /assets` filters and sort (API.md §8.3) — mirrors `services/assets.py`. */

const STATUSES = new Set([
  'available',
  'assigned',
  'prepared',
  'provided',
  'in_use',
  'collected',
  'missing',
  'deactivated_returned',
  'deactivated_bought_out',
  'deactivated_disposed',
])
const LOCATION_TYPES = new Set([
  'goods_in',
  'staging',
  'goods_out',
  'return',
  'in_transit',
  'in_use',
  'off_fleet',
])
const SOURCES = new Set(['import_new', 'import_status_sync', 'technician_scan', 'manual', 'seed'])

export const assetSortable: Record<string, (row: AssetRow) => unknown> = {
  serialNumber: (a) => a.serialNumber,
  assetTag: (a) => a.assetTag,
  status: (a) => a.status,
  checkedInAt: (a) => a.checkedInAt,
  statusChangedAt: (a) => a.statusChangedAt,
}

export function ASSET_SEARCH(row: AssetRow, q: string): boolean {
  const needle = q.toLowerCase()
  return [row.serialNumber, row.assetTag, row.installationPlace, row.model].some((value) =>
    value?.toLowerCase().includes(needle),
  )
}

const locations = () => locationMap()

export const assetFilters: Record<string, FilterFn<AssetRow>> = {
  status: filterIn((a) => a.status),
  siteId: (a, values) => values.includes(String(locations().get(a.locationId)?.siteId ?? '')),
  locationId: filterIn((a) => a.locationId),
  locationType: (a, values) => values.includes(locations().get(a.locationId)?.type ?? ''),
  articleId: filterIn((a) => a.articleId),
  category: (a, values) =>
    a.articleId !== null &&
    values.includes(db.collection('articles').get(a.articleId)?.category ?? ''),
  serviceRequestId: filterIn((a) => a.serviceRequestId),
  installationPlace: (a, [value]) =>
    a.installationPlace === (normalizePlace(value) ?? (value ?? '').toUpperCase()),
  hasInstallationPlace: filterBool((a) => a.installationPlace !== null),
  checkedInFrom: filterFrom((a) => a.checkedInAt),
  checkedInTo: filterTo((a) => a.checkedInAt),
  source: filterIn((a) => a.source),
}

/** Validates enum/id params (422 like the API) and returns all asset rows to filter. */
export function assetRows(request: Request): AssetRow[] | Response {
  const params = new URL(request.url).searchParams
  const errors: Record<string, string[]> = {}
  const check = (name: string, allowed: Set<string>) => {
    const bad = multiValue(params, name).filter((v) => !allowed.has(v))
    if (bad.length) errors[name] = bad.map((v) => `Unknown value '${v}'.`)
  }
  check('status', STATUSES)
  check('locationType', LOCATION_TYPES)
  check('source', SOURCES)
  for (const name of ['siteId', 'locationId', 'articleId']) {
    const bad = multiValue(params, name).filter((v) => !/^\d+$/.test(v))
    if (bad.length) errors[name] = bad.map((v) => `'${v}' is not a valid id.`)
  }
  const perPage = params.get('perPage')
  if (perPage && (!/^\d+$/.test(perPage) || Number(perPage) < 1 || Number(perPage) > 200))
    errors.perPage = ['Input should be less than or equal to 200']
  if (Object.keys(errors).length) return problems.validation(errors, undefined, request)
  return db.collection('assets').all()
}

export function exportAssetsCsv(rows: readonly AssetRow[]): string {
  const locs = locationMap()
  const articles = new Map(
    db
      .collection('articles')
      .all()
      .map((a) => [a.id, a]),
  )
  const srs = new Map(
    db
      .collection('service_requests')
      .all()
      .map((sr) => [sr.id, sr.number]),
  )
  return csv([
    [
      'Serial',
      'Asset tag',
      'Article number',
      'Article',
      'Model',
      'Status',
      'Location',
      'Installation place',
      'SR number',
      'Checked in',
    ],
    ...rows.map((a) => {
      const article = a.articleId ? articles.get(a.articleId) : undefined
      return [
        a.serialNumber,
        a.assetTag,
        article?.number,
        article?.name,
        a.model,
        label('assetStatus', a.status),
        locs.get(a.locationId)?.name,
        a.installationPlace,
        a.serviceRequestId ? srs.get(a.serviceRequestId) : null,
        docDateTime(a.checkedInAt),
      ]
    }),
  ])
}
