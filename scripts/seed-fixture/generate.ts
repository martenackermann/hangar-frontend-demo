/**
 * Generates `src/mocks/fixtures/seed.json`, the hand-made demo dataset of the MSW mock API:
 * SPEC §11 at a reduced scale, written as raw table rows (SPEC_RESOLUTIONS #16, row shapes in
 * `src/mocks/fixtures/types.ts`).
 *
 *   node scripts/seed-fixture/generate.ts [--check] [--anchor=YYYY-MM-DD]
 *
 * - Deterministic: one mulberry32(42) stream consumed in a fixed order. Every date is relative to
 *   the anchor T (business date; default: today in UTC). D0 = T if Mon–Fri, else the next
 *   Monday; `wd(n)` = n-th working day after D0. Times are Europe/Zurich business hours, written
 *   as UTC (`…Z`).
 * - `--check` validates the dataset before writing it (foreign keys, unique keys, status
 *   coverage, state invariants, asset ledgers, status histories, stock math, Theo's tour) and
 *   exits with code 1 without writing when anything is off.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type {
  AppConfig,
  ArticleCategory,
  AssetAction,
  AssetStatus,
  DeliveryType,
  DeviationCode,
  EnumsResponse,
  Gender,
  ItemSlot,
  LeaseReturnStatus,
  LocationType,
  OsReinstallTiming,
  ProcurementType,
  Role,
  ServiceRequestStatus,
  SiteKind,
  Trigger,
} from '../../src/lib/api/types.ts'
import {
  SEED_FIXTURE_VERSION,
  type ArticleRow,
  type ArticleSiteSettingRow,
  type AssetMovementRow,
  type AssetRow,
  type BookingCalendarRow,
  type ContactRow,
  type HoldSource,
  type LeaseReturnCommentRow,
  type LeaseReturnRow,
  type RegionRow,
  type RegionRuleRow,
  type SavedViewRow,
  type SeedFixture,
  type ServiceRequestItemRow,
  type ServiceRequestRow,
  type SiteRow,
  type StatusTransitionRow,
  type StockLocationRow,
  type UserRow,
  type VipEntryRow,
} from '../../src/mocks/fixtures/types.ts'

type Status = ServiceRequestStatus

// =================================================================================================
// CLI and enum catalog
// =================================================================================================

const argv = process.argv.slice(2)
const CHECK = argv.includes('--check')
const anchorFlag = argv.find((arg) => arg.startsWith('--anchor='))
const TODAY_UTC = new Date().toISOString().slice(0, 10)
const T = anchorFlag ? anchorFlag.slice('--anchor='.length) : TODAY_UTC
if (!/^\d{4}-\d{2}-\d{2}$/.test(T)) throw new Error(`Invalid --anchor value: ${T}`)

interface PersonaDef {
  email: string
  firstName: string
  lastName: string
  role: Role
  homeSiteCode: 'RIV' | 'HIL' | 'EAS' | null
}
interface CatalogModule {
  ENUM_CATALOG: EnumsResponse
  PERSONAS: readonly PersonaDef[]
  DEVIATION_CODES: readonly DeviationCode[]
}
// Loaded dynamically: catalog.ts imports `@/lib/api/types`, an alias tsconfig.node.json does not
// resolve, so a static import would pull it into the Node-side type check.
const catalogUrl = new URL('../../src/lib/enums/catalog.ts', import.meta.url).href
const { ENUM_CATALOG, PERSONAS, DEVIATION_CODES } = (await import(catalogUrl)) as CatalogModule

const OUTPUT = fileURLToPath(new URL('../../src/mocks/fixtures/seed.json', import.meta.url))

// =================================================================================================
// Random numbers (mulberry32, fixed seed) and small helpers
// =================================================================================================

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}
const random = mulberry32(42)

function int(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1))
}
function chance(probability: number): boolean {
  return random() < probability
}
function at0<T>(items: readonly T[], index: number): T {
  const value = items[index]
  if (value === undefined) throw new Error(`Index ${index} out of range (${items.length})`)
  return value
}
function pick<T>(items: readonly T[]): T {
  return at0(items, Math.floor(random() * items.length))
}
function weighted<T>(entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [value, weight] of entries) {
    roll -= weight
    if (roll < 0) return value
  }
  return at0(entries, entries.length - 1)[0]
}
function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const a = at0(copy, i)
    copy[i] = at0(copy, j)
    copy[j] = a
  }
  return copy
}
function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`Missing ${what}`)
  return value
}
function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

// =================================================================================================
// Dates: calendar days, working days, Europe/Zurich wall time → UTC
// =================================================================================================

const DAY_MS = 86_400_000
const MINUTE = 60_000
const HOUR = 3_600_000

function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`)
}
function addDays(day: string, n: number): string {
  return new Date(dayMs(day) + n * DAY_MS).toISOString().slice(0, 10)
}
function isWorkday(day: string): boolean {
  const weekday = new Date(dayMs(day)).getUTCDay()
  return weekday !== 0 && weekday !== 6
}
function addWorkdays(day: string, n: number): string {
  let current = day
  let left = Math.abs(n)
  const step = n < 0 ? -1 : 1
  while (left > 0) {
    current = addDays(current, step)
    if (isWorkday(current)) left--
  }
  return current
}
function workdayOnOrBefore(day: string): string {
  return isWorkday(day) ? day : addWorkdays(day, -1)
}
function minDay(a: string, b: string): string {
  return a < b ? a : b
}

/** D0: the anchor if it is a working day, else the next Monday. */
const D0 = isWorkday(T) ? T : addWorkdays(T, 1)
/** Last working day on or before the anchor ("today" for past events). */
const P0 = workdayOnOrBefore(T)
function wd(n: number): string {
  return addWorkdays(D0, n)
}
function pwd(n: number): string {
  return addWorkdays(P0, n)
}
function wdRange(from: number, to: number): string[] {
  const days: string[] = []
  for (let n = from; n <= to; n++) days.push(wd(n))
  return days
}

const zurichFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zurich',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})
function zurichOffset(utcMs: number): number {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {}
  for (const part of zurichFormat.formatToParts(utcMs)) parts[part.type] = part.value
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return wall - utcMs
}
/** UTC instant of a Europe/Zurich wall-clock time. */
function at(day: string, hour: number, minute = 0, second = 0): number {
  const wall = dayMs(day) + ((hour * 60 + minute) * 60 + second) * 1000
  return wall - zurichOffset(wall - zurichOffset(wall))
}
/** Business date (Europe/Zurich) of an instant. */
function zurichDay(ms: number): string {
  return new Date(ms + zurichOffset(ms)).toISOString().slice(0, 10)
}
function iso(ms: number): string {
  if (ms % 1000 !== 0) throw new Error(`Timestamp with milliseconds: ${ms}`)
  return new Date(ms).toISOString().replace('.000Z', 'Z')
}
function isoOrNull(ms: number | null): string | null {
  return ms === null ? null : iso(ms)
}

/**
 * Seed clock: the dataset shows the anchor day at 07:50 business time — after the 06:30 ITSM
 * import, the 07:00 dispatch run and the morning picking, before Theo's first stop. It is also
 * `meta.generatedAt`, so the output is byte-identical for the same anchor.
 */
const GENERATED_AT = at(T, 7, 50)
/** Latest event time of the story ("now" for simulated mail chains and comments). */
const NOW = at(T, 7, 30)
/** Last stock calculation and booking sync: 40 minutes before the seed clock. */
const CALCULATED_AT = GENERATED_AT - 40 * MINUTE

/** The daily mail dispatch run (07:00 business time); seconds spread the rows of one run. */
function jobAt(day: string): number {
  return at(day, 7, 0, int(4, 170))
}

// =================================================================================================
// Reference data (SPEC §11.1)
// =================================================================================================

type SiteCode = 'RIV' | 'HIL' | 'EAS' | 'CMP'
interface SiteDef {
  id: number
  code: SiteCode
  name: string
  label: string
  kind: SiteKind
  parentSiteId: number | null
  street: string
  zip: string
  city: string
}
const SITES: readonly SiteDef[] = [
  {
    id: 1,
    code: 'RIV',
    name: 'Riverton Hub',
    label: 'Riverton',
    kind: 'hub',
    parentSiteId: null,
    street: '12 Mill Road',
    zip: '10010',
    city: 'Riverton',
  },
  {
    id: 2,
    code: 'HIL',
    name: 'Hillford Hub',
    label: 'Hillford',
    kind: 'hub',
    parentSiteId: null,
    street: '3 Station Lane',
    zip: '20020',
    city: 'Hillford',
  },
  {
    id: 3,
    code: 'EAS',
    name: 'Eastgate Hub',
    label: 'Eastgate',
    kind: 'hub',
    parentSiteId: null,
    street: '88 Dock Road',
    zip: '30030',
    city: 'Eastgate',
  },
  {
    id: 4,
    code: 'CMP',
    name: 'Campus',
    label: 'Campus',
    kind: 'campus',
    parentSiteId: 1,
    street: '1 Campus Way',
    zip: '10500',
    city: 'Riverton',
  },
]
const RIV = 1
const HIL = 2
const EAS = 3
const HUBS = [RIV, HIL, EAS] as const
function siteById(id: number): SiteDef {
  return must(
    SITES.find((site) => site.id === id),
    `site ${id}`,
  )
}

const LOCATION_LABELS: Record<LocationType, string> = {
  goods_in: 'Goods in',
  staging: 'Staging',
  goods_out: 'Goods out',
  return: 'Returns',
  in_transit: 'In transit',
  in_use: 'At user',
  off_fleet: 'Off fleet',
}
const STOCK_TYPES: readonly LocationType[] = ['goods_in', 'staging', 'goods_out']
interface LocationDef {
  id: number
  code: string
  name: string
  type: LocationType
  siteId: number | null
}
const LOCATIONS: LocationDef[] = []
for (const site of SITES) {
  const types: LocationType[] =
    site.kind === 'hub' ? ['goods_in', 'staging', 'goods_out', 'return'] : ['return']
  for (const type of types) {
    LOCATIONS.push({
      id: LOCATIONS.length + 1,
      code: `${site.code}-${type.toUpperCase()}`,
      name: `${site.label} · ${LOCATION_LABELS[type]}`,
      type,
      siteId: site.id,
    })
  }
}
for (const type of ['in_transit', 'in_use', 'off_fleet'] as const) {
  LOCATIONS.push({
    id: LOCATIONS.length + 1,
    code: type.toUpperCase(),
    name: LOCATION_LABELS[type],
    type,
    siteId: null,
  })
}
function locationOf(siteId: number | null, type: LocationType): LocationDef {
  return must(
    LOCATIONS.find((location) => location.siteId === siteId && location.type === type),
    `location ${siteId ?? 'global'}/${type}`,
  )
}
const IN_TRANSIT = locationOf(null, 'in_transit')
const IN_USE = locationOf(null, 'in_use')
const OFF_FLEET = locationOf(null, 'off_fleet')

type RegionCode =
  | 'riverton'
  | 'hillford'
  | 'eastgate'
  | 'northport'
  | 'westbay'
  | 'southmere'
  | 'lakeside'
  | 'highmoor'
  | 'oakridge'
interface RegionDef {
  id: number
  code: RegionCode
  name: string
  siteId: number
  delivery: DeliveryType
  prefix: string
  pickup: readonly [string, string, string, string] | null
  /** SPEC §11.3 region weight (%). */
  weight: number
  /** Field technician covering the region's calendar (SPEC §11.6). */
  technician: string
  calendarId: number
}
const REGION_TABLE: readonly Omit<RegionDef, 'id' | 'calendarId'>[] = [
  {
    code: 'riverton',
    name: 'Riverton',
    siteId: RIV,
    delivery: 'technician',
    prefix: '10',
    pickup: null,
    weight: 22,
    technician: 'theo.technician@example.com',
  },
  {
    code: 'hillford',
    name: 'Hillford',
    siteId: HIL,
    delivery: 'technician',
    prefix: '20',
    pickup: null,
    weight: 18,
    technician: 'tara.lindqvist@example.com',
  },
  {
    code: 'eastgate',
    name: 'Eastgate',
    siteId: EAS,
    delivery: 'technician',
    prefix: '30',
    pickup: null,
    weight: 14,
    technician: 'omar.reyes@example.com',
  },
  {
    code: 'northport',
    name: 'Northport',
    siteId: EAS,
    delivery: 'parcel_to_pickup_point',
    prefix: '40',
    pickup: ['Northport Office', '4 Quay Street', '40100', 'Northport'],
    weight: 8,
    technician: 'omar.reyes@example.com',
  },
  {
    code: 'westbay',
    name: 'Westbay',
    siteId: EAS,
    delivery: 'parcel_to_user',
    prefix: '50',
    pickup: null,
    weight: 8,
    technician: 'jonas.weber@example.com',
  },
  {
    code: 'southmere',
    name: 'Southmere',
    siteId: EAS,
    delivery: 'parcel_to_pickup_point',
    prefix: '60',
    pickup: ['Southmere Office', '21 Market Row', '60200', 'Southmere'],
    weight: 8,
    technician: 'omar.reyes@example.com',
  },
  {
    code: 'lakeside',
    name: 'Lakeside',
    siteId: EAS,
    delivery: 'parcel_to_user',
    prefix: '70',
    pickup: null,
    weight: 8,
    technician: 'jonas.weber@example.com',
  },
  {
    code: 'highmoor',
    name: 'Highmoor',
    siteId: EAS,
    delivery: 'parcel_to_pickup_point',
    prefix: '80',
    pickup: ['Highmoor Office', '7 Ridge Avenue', '80300', 'Highmoor'],
    weight: 7,
    technician: 'jonas.weber@example.com',
  },
  {
    code: 'oakridge',
    name: 'Oakridge',
    siteId: EAS,
    delivery: 'parcel_to_user',
    prefix: '90',
    pickup: null,
    weight: 7,
    technician: 'jonas.weber@example.com',
  },
]
/** Booking calendar ids 1–9 = regions sorted by name (SPEC_RESOLUTIONS #6). */
const CALENDAR_ORDER = [...REGION_TABLE].sort((a, b) => a.name.localeCompare(b.name))
const REGIONS: readonly RegionDef[] = REGION_TABLE.map((region, index) => ({
  ...region,
  id: index + 1,
  calendarId: CALENDAR_ORDER.findIndex((entry) => entry.code === region.code) + 1,
}))
function regionByCode(code: RegionCode): RegionDef {
  return must(
    REGIONS.find((region) => region.code === code),
    `region ${code}`,
  )
}
const RIVERTON = regionByCode('riverton')
function calendarName(calendarId: number): string {
  return `${at0(CALENDAR_ORDER, calendarId - 1).name} route`
}

/** 21 rules: zip prefix + city per region, two Campus rules, the Westbay removal rule. */
const REGION_RULES: RegionRuleRow[] = []
for (const region of REGIONS) {
  REGION_RULES.push(
    {
      id: 0,
      regionId: region.id,
      matchKind: 'zip_prefix',
      pattern: region.prefix,
      procurementType: null,
      deliveryType: null,
      isCampus: false,
      priority: 0,
      isActive: true,
      note: null,
    },
    {
      id: 0,
      regionId: region.id,
      matchKind: 'city',
      pattern: region.name.toLowerCase(),
      procurementType: null,
      deliveryType: null,
      isCampus: false,
      priority: 0,
      isActive: true,
      note: null,
    },
  )
}
REGION_RULES.push(
  {
    id: 0,
    regionId: RIVERTON.id,
    matchKind: 'zip',
    pattern: '10500',
    procurementType: null,
    deliveryType: null,
    isCampus: true,
    priority: 0,
    isActive: true,
    note: 'Campus address',
  },
  {
    id: 0,
    regionId: RIVERTON.id,
    matchKind: 'cost_center',
    pattern: 'CC-9100',
    procurementType: null,
    deliveryType: null,
    isCampus: true,
    priority: 0,
    isActive: true,
    note: 'Campus cost centre',
  },
  {
    id: 0,
    regionId: regionByCode('westbay').id,
    matchKind: 'zip_prefix',
    pattern: '50',
    procurementType: 'removal',
    deliveryType: 'technician',
    isCampus: false,
    priority: 10,
    isActive: true,
    note: 'Removals are collected by a technician',
  },
)
REGION_RULES.forEach((rule, index) => {
  rule.id = index + 1
})
function ruleFor(predicate: (rule: RegionRuleRow) => boolean, what: string): RegionRuleRow {
  return must(REGION_RULES.find(predicate), `rule ${what}`)
}

type ArticleTuple = readonly [string, ArticleCategory, string, string, string, boolean, number]
const ARTICLE_TABLE: readonly ArticleTuple[] = [
  ['A-10001', 'laptop', 'Aero 14 G3 Laptop', 'KD-AERO14-G3', 'Laptop Standard 14', true, 1.6],
  ['A-10002', 'laptop', 'Aero 16 G3 Laptop', 'KD-AERO16-G3', 'Laptop Performance 16', true, 2.1],
  [
    'A-10003',
    'laptop',
    'Aero 13 Flip Laptop',
    'KD-AERO13-FLIP',
    'Laptop Convertible 13',
    true,
    1.3,
  ],
  [
    'A-10004',
    'laptop',
    'Strato X1 Mobile Workstation',
    'KD-STRATO-X1',
    'Laptop Workstation 15',
    true,
    2.4,
  ],
  [
    'A-10005',
    'laptop',
    'Aero 14 G2 Laptop',
    'KD-AERO14-G2',
    'Laptop Standard 14 (previous)',
    false,
    1.7,
  ],
  ['A-10006', 'desktop', 'Cube Mini D5', 'KD-CUBE-D5', 'Desktop Compact', true, 1.2],
  ['A-10007', 'tablet', 'Slate 11 Tablet', 'KD-SLATE-11', 'Tablet 11', true, 0.6],
  ['A-10101', 'docking_station', 'Dock U4', 'KD-DOCK-U4', 'Docking Station USB-C', true, 0.8],
  [
    'A-10102',
    'docking_station',
    'Dock T5 Pro',
    'KD-DOCK-T5P',
    'Docking Station Thunderbolt',
    true,
    1.0,
  ],
  [
    'A-10103',
    'docking_station',
    'Dock U3',
    'KD-DOCK-U3',
    'Docking Station USB-C (previous)',
    false,
    0.8,
  ],
  ['A-10201', 'monitor', 'View 24F Monitor', 'LM-VIEW-24F', 'Monitor 24', true, 4.5],
  ['A-10202', 'monitor', 'View 27Q Monitor', 'LM-VIEW-27Q', 'Monitor 27', true, 6.2],
  ['A-10203', 'monitor', 'View 27Q-C Monitor', 'LM-VIEW-27QC', 'Monitor 27 USB-C', true, 6.4],
  [
    'A-10204',
    'monitor',
    'View 34W Curved Monitor',
    'LM-VIEW-34W',
    'Monitor 34 Ultrawide',
    true,
    8.9,
  ],
  ['A-10205', 'monitor', 'View 22 Monitor', 'LM-VIEW-22', 'Monitor 22 (previous)', false, 3.8],
  ['A-10301', 'headset', 'Talk H2 Mono Headset', 'QA-TALK-H2', 'Headset Mono', true, 0.3],
  ['A-10302', 'headset', 'Talk H3 Stereo Headset', 'QA-TALK-H3', 'Headset Stereo', true, 0.3],
  ['A-10303', 'headset', 'Talk H5 ANC Headset', 'QA-TALK-H5', 'Headset Wireless ANC', true, 0.4],
  ['A-10304', 'accessory', 'Speakerphone SP1', 'QA-SP1', 'Speakerphone', true, 0.4],
  ['A-10401', 'keyboard', 'Type K1 Keyboard', 'AP-TYPE-K1', 'Keyboard Wired', true, 0.7],
  [
    'A-10402',
    'keyboard',
    'Type K2 Wireless Keyboard',
    'AP-TYPE-K2',
    'Keyboard Wireless',
    true,
    0.6,
  ],
  ['A-10403', 'mouse', 'Point M1 Mouse', 'AP-POINT-M1', 'Mouse Wired', true, 0.1],
  ['A-10404', 'mouse', 'Point M3 Wireless Mouse', 'AP-POINT-M3', 'Mouse Wireless', true, 0.1],
  ['A-10405', 'keyboard', 'Combo KM2 Set', 'AP-COMBO-KM2', 'Keyboard and Mouse Set', true, 0.9],
  ['A-10501', 'webcam', 'Lens C2 Webcam', 'LM-LENS-C2', 'Webcam HD', true, 0.2],
  ['A-10502', 'webcam', 'Lens C4 4K Webcam', 'LM-LENS-C4', 'Webcam 4K', true, 0.2],
  ['A-10601', 'bag', 'Carry 14 Sleeve', 'PW-CARRY-14', 'Laptop Sleeve 14', true, 0.3],
  ['A-10602', 'bag', 'Carry 16 Backpack', 'PW-CARRY-16', 'Laptop Backpack 16', true, 0.9],
  ['A-10701', 'accessory', 'Power 65W USB-C Charger', 'AP-PWR-65', 'Charger 65W', true, 0.3],
  ['A-10702', 'accessory', 'Power 100W USB-C Charger', 'AP-PWR-100', 'Charger 100W', true, 0.4],
  ['A-10703', 'accessory', 'Cable USB-C 2 m', 'AP-CBL-C2', 'Cable USB-C', true, 0.1],
  ['A-10704', 'accessory', 'Adapter USB-C to HDMI', 'AP-ADP-HDMI', 'Adapter HDMI', true, 0.1],
  [
    'A-10705',
    'accessory',
    'Adapter USB-C to Ethernet',
    'AP-ADP-ETH',
    'Adapter Ethernet',
    true,
    0.1,
  ],
  ['A-10706', 'accessory', 'Stand LS1 Laptop Stand', 'AP-STAND-LS1', 'Laptop Stand', true, 1.1],
  ['A-10707', 'accessory', 'Arm MA2 Monitor Arm', 'AP-ARM-MA2', 'Monitor Arm', true, 3.0],
  ['A-10708', 'accessory', 'Privacy Filter 14', 'AP-PF-14', 'Privacy Filter 14', true, 0.2],
  ['A-10709', 'accessory', 'Privacy Filter 16', 'AP-PF-16', 'Privacy Filter 16', true, 0.2],
  ['A-10710', 'accessory', 'Lock KL1 Cable Lock', 'AP-LOCK-KL1', 'Cable Lock', true, 0.2],
  ['A-10711', 'accessory', 'Presenter P1', 'AP-PRES-P1', 'Presenter', true, 0.1],
  ['A-10712', 'accessory', 'Stylus S1 Pen', 'AP-STYLUS-S1', 'Stylus Pen', true, 0.1],
]
const MANUFACTURERS: Record<string, string> = {
  KD: 'Kestrel Devices',
  LM: 'Lumora',
  QA: 'Quillon Audio',
  AP: 'Arden Peripherals',
  PW: 'Packwell',
}
interface ArticleDef {
  id: number
  number: string
  category: ArticleCategory
  name: string
  modelNumber: string
  internalDescription: string
  isActive: boolean
  weightKg: number
  prefix: string
}
const ARTICLES: readonly ArticleDef[] = ARTICLE_TABLE.map(
  ([number, category, name, modelNumber, internalDescription, isActive, weightKg], index) => ({
    id: index + 1,
    number,
    category,
    name,
    modelNumber,
    internalDescription,
    isActive,
    weightKg,
    prefix: modelNumber.slice(0, 2),
  }),
)
/** Active article per device type (`lower(internal_description)` is unique among active ones). */
function articleForType(type: string): ArticleDef | null {
  return (
    ARTICLES.find(
      (article) =>
        article.isActive && article.internalDescription.toLowerCase() === type.toLowerCase(),
    ) ?? null
  )
}
function articleByNumber(number: string): ArticleDef {
  return must(
    ARTICLES.find((article) => article.number === number),
    `article ${number}`,
  )
}
function typeArticle(type: string): ArticleDef {
  return must(articleForType(type), `article for ${type}`)
}

// ---- users (personas) ----

const USERS: readonly (PersonaDef & { id: number })[] = PERSONAS.map((persona, index) => ({
  ...persona,
  id: index + 1,
}))
function userId(email: string): number {
  return must(
    USERS.find((user) => user.email === email),
    `user ${email}`,
  ).id
}
const DANA = userId('dana.dispatcher@example.com')
const THEO = userId('theo.technician@example.com')
const VIC = userId('vic.viewer@example.com')
const ADA = userId('ada.admin@example.com')
const TARA = userId('tara.lindqvist@example.com')
const OMAR = userId('omar.reyes@example.com')
const JONAS = userId('jonas.weber@example.com')
/** Who scans installation places at each hub. */
const HUB_SCANNERS: Record<number, readonly number[]> = {
  [RIV]: [THEO, DANA],
  [HIL]: [TARA],
  [EAS]: [OMAR, JONAS],
}

// ---- vocabulary (neutral, fictional) ----

const FIRST_NAMES = [
  'Mia',
  'Noah',
  'Lena',
  'Ravi',
  'Sofia',
  'Jonah',
  'Amara',
  'Felix',
  'Nora',
  'Elias',
  'Priya',
  'Mateo',
  'Ines',
  'Kai',
  'Leila',
  'Oskar',
  'Hana',
  'Samir',
  'Clara',
  'Tobias',
  'Yara',
  'Luca',
  'Maren',
  'Idris',
  'Selma',
  'Arjun',
  'Freya',
  'Milan',
  'Zoe',
  'Emil',
  'Anika',
  'Rafael',
  'Lucia',
  'Henrik',
  'Nadia',
  'Bastian',
  'Aylin',
  'Viktor',
  'Esme',
  'Daniel',
  'Maya',
  'Julian',
  'Talia',
  'Anton',
  'Leona',
  'Malik',
  'Iris',
  'Fabian',
  'Sana',
  'Levi',
  'Greta',
  'Nico',
  'Amira',
  'Jasper',
  'Liv',
  'Kenji',
  'Alma',
  'Rohan',
  'Ella',
  'Matteo',
] as const
const LAST_NAMES = [
  'Turner',
  'Hale',
  'Brooks',
  'Lindgren',
  'Okafor',
  'Castell',
  'Moreau',
  'Patel',
  'Ferreira',
  'Novak',
  'Haddad',
  'Sorensen',
  'Kimura',
  'Albers',
  'Dubois',
  'Mensah',
  'Varga',
  'Quinn',
  'Rasmussen',
  'Ortega',
  'Bianchi',
  'Keller',
  'Nakamura',
  'Osei',
  'Petrov',
  'Lund',
  'Marchetti',
  'Andersson',
  'Holm',
  'Fischer',
  'Nyberg',
  'Calloway',
  'Duarte',
  'Brandt',
  'Ivanova',
  'Whitlock',
  'Ashford',
  'Morrow',
  'Pellegrini',
  'Oduya',
  'Strand',
  'Vance',
  'Lowell',
  'Ferris',
  'Hartmann',
  'Iqbal',
  'Kovac',
  'Sato',
  'Lambert',
  'Renner',
  'Abara',
  'Delgado',
  'Weller',
  'Fontaine',
  'Ekstrom',
  'Halloran',
  'Adeyemi',
  'Garner',
  'Thorne',
  'Sandoval',
] as const
const STREETS = [
  'Harbour Road',
  'Elm Street',
  'Mill Lane',
  'Station Road',
  'Church Lane',
  'Park Avenue',
  'Oak Street',
  'Bridge Street',
  'Market Street',
  'Meadow Way',
  'Orchard Close',
  'Hill Road',
  'River Walk',
  'Chapel Street',
  'Garden Row',
  'Cedar Avenue',
  'Linden Way',
  'Quarry Lane',
  'Willow Crescent',
  'Beacon Street',
] as const
const DEPARTMENTS = [
  'Finance',
  'Procurement',
  'Human Resources',
  'Logistics',
  'Customer Service',
  'Engineering',
  'Legal',
  'Marketing',
  'Facilities',
  'Quality Assurance',
  'Research',
  'Sales Operations',
  'Controlling',
  'IT Service Desk',
] as const
const SOFTWARE = [
  'Office Suite',
  'PDF Reader',
  'Diagram Tool',
  'VPN Client',
  'Statistics Package',
] as const
const SR_NOTES = [
  'Please call before arrival',
  'Desk is on the second floor next to the kitchen',
  'User works part-time (Mon–Wed)',
  'Reception will escort the technician',
  'Parking is available behind the building',
  'Please bring a spare power cable',
] as const
const UNRESOLVED_CITIES = ['Fernvale', 'Brookhollow'] as const

function phone(): string {
  return `555-01${pad(int(0, 99), 2)}`
}

// =================================================================================================
// Contacts and VIPs
// =================================================================================================

interface ContactDraft {
  row: ContactRow
  region: RegionDef | null
  campus: boolean
  costCenter: string
}
const contacts: ContactDraft[] = []
const namePool = shuffle(
  FIRST_NAMES.flatMap((first) => LAST_NAMES.map((last) => [first, last] as const)),
)
let nameCursor = 0

function costCenterFor(campus: boolean): string {
  if (campus && chance(0.5)) return 'CC-9100'
  return `CC-${int(1000, 8999)}`
}

function createContact(options: {
  region: RegionDef | null
  campus?: boolean
  noEmail?: boolean
}): ContactDraft {
  const campus = options.campus === true
  const [firstName, lastName] = at0(namePool, nameCursor++)
  const id = contacts.length + 1
  let street: string
  let zip: string
  let city: string
  let building: string | null = null
  let room: string | null = null
  if (campus) {
    street = '1 Campus Way'
    zip = '10500'
    city = 'Riverton'
    building = pick(['C1', 'C2', 'C3', 'C4'])
    room = `${int(0, 4)}.${pad(int(1, 40), 2)}`
  } else if (options.region === null) {
    street = `${int(1, 120)} ${pick(STREETS)}`
    zip = `99${int(100, 899)}`
    city = pick(UNRESOLVED_CITIES)
  } else {
    street = `${int(1, 120)} ${pick(STREETS)}`
    do {
      zip = `${options.region.prefix}${int(100, 899)}`
    } while (zip === '10500')
    city = options.region.name
    if (chance(0.5)) building = `B${int(1, 6)}`
    if (chance(0.5)) room = `${int(0, 5)}.${pad(int(1, 40), 2)}`
  }
  const contact: ContactDraft = {
    row: {
      id,
      userId: `E${100000 + id}`,
      gender: weighted<Gender>([
        ['female', 42],
        ['male', 42],
        ['diverse', 4],
        ['unspecified', 12],
      ]),
      firstName,
      lastName,
      email: options.noEmail === true ? null : `${firstName}.${lastName}@example.com`.toLowerCase(),
      phone: chance(0.6) ? phone() : null,
      mobile: chance(0.3) ? phone() : null,
      department: pick(DEPARTMENTS),
      street,
      zip,
      city,
      building,
      room,
      isActive: true,
    },
    region: options.region,
    campus,
    costCenter: costCenterFor(campus),
  }
  contacts.push(contact)
  return contact
}

const VIP_DEFS = [
  {
    vipType: 'Board',
    title: 'Chair of the Board',
    note: 'Appointments only via the executive office',
  },
  { vipType: 'Executive', title: 'Chief Operating Officer', note: null },
  { vipType: 'Board', title: 'Board Member', note: null },
  {
    vipType: 'Executive',
    title: 'Chief Financial Officer',
    note: 'Prefers appointments before 09:00',
  },
  { vipType: 'Assistant', title: 'Executive Assistant to the COO', note: null },
  { vipType: 'Board', title: 'Board Member', note: null },
  { vipType: 'Executive', title: 'Head of Strategy', note: null },
  {
    vipType: 'Assistant',
    title: 'Office Manager, Executive Floor',
    note: 'Coordinates all executive hardware requests',
  },
] as const
const vipContacts = new Map<number, ContactDraft>()
function vipContact(index: number, region: RegionDef | null, campus: boolean): ContactDraft {
  const existing = vipContacts.get(index)
  if (existing) return existing
  const contact = createContact({ region, campus })
  vipContacts.set(index, contact)
  return contact
}
function isVipContact(contact: ContactDraft): boolean {
  return [...vipContacts.values()].includes(contact)
}

// =================================================================================================
// Service request scenarios (SPEC §11.3 ÷ 3, every status populated)
// =================================================================================================

interface Scenario {
  status: Status
  key: string
  region?: RegionCode | 'campus' | 'unresolved'
  procurement?: ProcurementType
  baseType?: string
  vip?: number
  noEmail?: boolean
}
function times(count: number, scenario: Scenario): Scenario[] {
  return Array.from({ length: count }, () => ({ ...scenario }))
}
const SCENARIOS: readonly Scenario[] = [
  // imported (8): unknown device type ×3, unresolved zip ×2, contact without email ×2
  ...times(3, { status: 'imported', key: 'unknown-article', baseType: 'Laptop Ultra 15' }),
  ...times(2, { status: 'imported', key: 'unresolved', region: 'unresolved' }),
  ...times(2, { status: 'imported', key: 'no-email', noEmail: true }),
  { status: 'imported', key: 'plain' },
  // imported_vip (2)
  { status: 'imported_vip', key: 'vip', vip: 0 },
  { status: 'imported_vip', key: 'vip', vip: 1 },
  // hardware_unavailable (4): import hold ×2, import hold whose group changed, manual hold
  ...times(2, { status: 'hardware_unavailable', key: 'hold-import' }),
  { status: 'hardware_unavailable', key: 'hold-left' },
  { status: 'hardware_unavailable', key: 'hold-manual', baseType: 'Laptop Workstation 15' },
  // invited (8): paused indefinitely, paused until a date, a removal
  { status: 'invited', key: 'paused' },
  { status: 'invited', key: 'paused-until' },
  { status: 'invited', key: 'plain', procurement: 'removal' },
  ...times(5, { status: 'invited', key: 'plain' }),
  // campus_info_sent (3)
  ...times(3, { status: 'campus_info_sent', key: 'campus', region: 'campus' }),
  // reminder_1_sent (5)
  { status: 'reminder_1_sent', key: 'paused' },
  { status: 'reminder_1_sent', key: 'plain', procurement: 'removal' },
  ...times(3, { status: 'reminder_1_sent', key: 'plain' }),
  // reminder_2_sent (4)
  ...times(4, { status: 'reminder_2_sent', key: 'plain' }),
  // escalated (3): two supplied by Eastgate, one stale
  { status: 'escalated', key: 'plain', region: 'eastgate' },
  { status: 'escalated', key: 'plain', region: 'westbay' },
  { status: 'escalated', key: 'stale', region: 'hillford' },
  // reschedule_needed (4): one per resume status
  { status: 'reschedule_needed', key: 'resume-booked', region: 'hillford' },
  { status: 'reschedule_needed', key: 'resume-done', region: 'eastgate' },
  { status: 'reschedule_needed', key: 'resume-picking', region: 'riverton' },
  { status: 'reschedule_needed', key: 'resume-shipped', region: 'westbay' },
  // appointment_booked (10)
  { status: 'appointment_booked', key: 'soon', region: 'riverton' },
  { status: 'appointment_booked', key: 'this-week', region: 'riverton' },
  { status: 'appointment_booked', key: 'campus', region: 'campus' },
  { status: 'appointment_booked', key: 'vip-released', vip: 2 },
  { status: 'appointment_booked', key: 'plain', procurement: 'removal' },
  ...times(5, { status: 'appointment_booked', key: 'plain' }),
  // personalization_in_progress (4)
  ...times(4, { status: 'personalization_in_progress', key: 'plain' }),
  // personalization_done (5): 2 with software still unchecked
  ...times(2, { status: 'personalization_done', key: 'software-open' }),
  ...times(3, { status: 'personalization_done', key: 'plain' }),
  // ready_for_picking (7): one skipped preparation
  { status: 'ready_for_picking', key: 'skip-prep' },
  ...times(6, { status: 'ready_for_picking', key: 'plain' }),
  // shipped (5): parcel regions; one already closed in ITSM
  { status: 'shipped', key: 'itsm-closed' },
  ...times(4, { status: 'shipped', key: 'plain' }),
  // provided (7): Theo's five stops today, two overdue
  ...times(5, { status: 'provided', key: 'theo', region: 'riverton' }),
  { status: 'provided', key: 'overdue', region: 'hillford' },
  { status: 'provided', key: 'overdue', region: 'eastgate' },
  // completed (16)
  ...times(3, { status: 'completed', key: 'theo', region: 'riverton' }),
  { status: 'completed', key: 'dv10', procurement: 'replacement' },
  { status: 'completed', key: 'dv12' },
  { status: 'completed', key: 'dv13' },
  { status: 'completed', key: 'dv14' },
  { status: 'completed', key: 'manual', procurement: 'new_hire' },
  { status: 'completed', key: 'campus', region: 'campus', procurement: 'replacement' },
  { status: 'completed', key: 'removal', region: 'westbay', procurement: 'removal' },
  ...times(2, { status: 'completed', key: 'closed-complete' }),
  { status: 'completed', key: 'vip-released', vip: 3 },
  ...times(3, { status: 'completed', key: 'plain' }),
  // cancelled (4): on site, by dispatcher ×2, by ITSM
  { status: 'cancelled', key: 'on-site', region: 'hillford' },
  { status: 'cancelled', key: 'dispatcher-invited' },
  { status: 'cancelled', key: 'dispatcher-booked' },
  { status: 'cancelled', key: 'itsm' },
]

const THEO_TODAY: readonly (readonly [number, number])[] = [
  [8, 0],
  [9, 30],
  [11, 0],
  [13, 0],
  [14, 30],
]
/** Theo's tour on wd(−1): three completed stops (and the DV04 reschedule at 11:00). */
const THEO_YESTERDAY: readonly (readonly [number, number])[] = [
  [8, 0],
  [9, 30],
  [13, 30],
]
const HOLD_GROUP = 'Rollout Hardware Hold'
const PRE_ASSET_DEMAND: readonly Status[] = [
  'imported',
  'imported_vip',
  'invited',
  'campus_info_sent',
  'reminder_1_sent',
  'reminder_2_sent',
  'escalated',
  'appointment_booked',
]
const DEMAND_STATUSES: readonly Status[] = [
  ...PRE_ASSET_DEMAND,
  'personalization_in_progress',
  'personalization_done',
  'ready_for_picking',
]
const WITH_APPT: readonly Status[] = [
  'appointment_booked',
  'personalization_in_progress',
  'personalization_done',
  'ready_for_picking',
  'provided',
  'shipped',
]
const SLOT_ORDER: readonly ItemSlot[] = [
  'new_base',
  'new_peripheral_1',
  'new_peripheral_2',
  'old_base',
  'old_peripheral_1',
  'old_peripheral_2',
]

interface ItemDraft {
  slot: ItemSlot
  requestedType: string | null
  article: ArticleDef | null
  /** Old items: model of the device at the user. */
  oldArticle: ArticleDef | null
  asset: AssetDraft | null
  assignedAt: number | null
  assignedBy: number | null
  packedAt: number | null
  packedBy: number | null
  verifiedAt: number | null
  verifiedBy: number | null
}
interface SrEvent {
  at: number
  action: string
  from: Status | null
  to: Status
  trigger: Trigger
  actor: number | null
  comment: string | null
  payload: Record<string, unknown> | null
}
interface Slot {
  day: string
  start: number
  end: number
  calendarId: number
}
interface SrDraft {
  seq: number
  sc: Scenario
  contact: ContactDraft
  region: RegionDef | null
  campus: boolean
  vip: boolean
  procurement: ProcurementType
  ruleId: number | null
  deliveryType: DeliveryType | null
  supplyingSiteId: number | null
  items: ItemDraft[]
  events: SrEvent[]
  cur: Status | null
  importedAt: number
  lastImportedAt: number
  openedAt: number
  itsmState: string
  assignmentGroup: string
  communicationDay: string | null
  paused: boolean
  pauseReason: string | null
  resumeDate: string | null
  holdNotifiedAt: number | null
  holdSource: HoldSource | null
  appointment: Slot | null
  claimedAt: number | null
  editorId: number | null
  personalizedAt: number | null
  orderClosedAt: number | null
  providedAt: number | null
  shippedAt: number | null
  completedAt: number | null
  cancelledAt: number | null
  /** Actor of the transition that closed or cancelled the visit (technician or dispatcher). */
  finisher: number | null
  deviationId: number | null
  deviationComment: string | null
  resumeStatus: Status | null
  withoutAssetPrep: boolean
  osReinstall: OsReinstallTiming | null
  requestedSoftware: string[]
  addedSoftware: string[]
  installedSoftware: string[]
  softwareStage: 'none' | 'partial' | 'open' | 'done'
  note: string | null
  onsitePhone: string | null
  /** Asset stage of the new devices (drives the asset generator). */
  assetStage: 'none' | 'assigned' | 'prepared' | 'provided' | 'returned' | 'deployed' | 'released'
  id: number
  number: string
  taskNumber: string
}

function chooseRegion(sc: Scenario): { region: RegionDef | null; campus: boolean } {
  if (sc.region === 'campus') return { region: RIVERTON, campus: true }
  if (sc.region === 'unresolved') return { region: null, campus: false }
  if (sc.region !== undefined) return { region: regionByCode(sc.region), campus: false }
  let pool = [...REGIONS]
  if (sc.status === 'shipped') pool = pool.filter((region) => region.delivery !== 'technician')
  if (sc.status === 'provided') pool = pool.filter((region) => region.delivery === 'technician')
  if (sc.procurement === 'removal') {
    pool = pool.filter((region) => region.delivery === 'technician' || region.code === 'westbay')
  }
  return { region: weighted(pool.map((region) => [region, region.weight] as const)), campus: false }
}

/** SPEC §6.1 resolution for the seed's addresses (zip prefix wins over city; Campus rules first). */
function resolveRegion(d: SrDraft): void {
  if (d.region === null) return
  let rule: RegionRuleRow
  let delivery: DeliveryType
  if (d.campus) {
    rule =
      d.contact.costCenter === 'CC-9100'
        ? ruleFor((r) => r.matchKind === 'cost_center', 'campus cost centre')
        : ruleFor((r) => r.matchKind === 'zip' && r.pattern === '10500', 'campus zip')
    delivery = 'technician'
  } else if (d.procurement === 'removal' && d.region.code === 'westbay') {
    rule = ruleFor((r) => r.procurementType === 'removal', 'westbay removal')
    delivery = 'technician'
  } else {
    const regionId = d.region.id
    rule = ruleFor(
      (r) => r.regionId === regionId && r.matchKind === 'zip_prefix' && r.procurementType === null,
      `zip prefix ${d.region.prefix}`,
    )
    // SPEC_RESOLUTIONS #54: removal SRs are always collected by a technician.
    delivery = d.procurement === 'removal' ? 'technician' : d.region.delivery
  }
  d.ruleId = rule.id
  d.deliveryType = delivery
  d.supplyingSiteId = d.region.siteId
}

function newItem(slot: ItemSlot, type: string): ItemDraft {
  return {
    slot,
    requestedType: type,
    article: articleForType(type),
    oldArticle: null,
    asset: null,
    assignedAt: null,
    assignedBy: null,
    packedAt: null,
    packedBy: null,
    verifiedAt: null,
    verifiedBy: null,
  }
}
function oldItem(slot: ItemSlot, article: ArticleDef): ItemDraft {
  return { ...newItem(slot, ''), requestedType: null, article: null, oldArticle: article }
}
function buildItems(d: SrDraft): void {
  if (d.procurement !== 'removal') {
    d.items.push(
      newItem(
        'new_base',
        d.sc.baseType ??
          weighted([
            ['Laptop Standard 14', 60],
            ['Laptop Performance 16', 20],
            ['Laptop Convertible 13', 10],
            ['Laptop Workstation 15', 10],
          ] as const),
      ),
    )
    if (chance(0.65)) {
      d.items.push(
        newItem(
          'new_peripheral_1',
          weighted([
            ['Docking Station USB-C', 70],
            ['Docking Station Thunderbolt', 30],
          ] as const),
        ),
      )
    }
    if (chance(0.45)) {
      d.items.push(
        newItem(
          'new_peripheral_2',
          weighted([
            ['Monitor 27', 40],
            ['Monitor 24', 25],
            ['Monitor 34 Ultrawide', 15],
            ['Headset Wireless ANC', 20],
          ] as const),
        ),
      )
    }
  }
  if (d.procurement === 'replacement' || d.procurement === 'removal') {
    const oldBase = weighted([
      ['A-10005', 65],
      ['A-10001', 15],
      ['A-10002', 10],
      ['A-10003', 10],
    ] as const)
    d.items.push(oldItem('old_base', articleByNumber(oldBase)))
    if (chance(0.15)) d.items.push(oldItem('old_peripheral_1', articleByNumber('A-10103')))
  }
}
function newItems(d: SrDraft): ItemDraft[] {
  return d.items.filter((it) => it.slot.startsWith('new_'))
}
function oldItems(d: SrDraft): ItemDraft[] {
  return d.items.filter((it) => it.slot.startsWith('old_'))
}

// ---- timeline helpers ----

function ev(
  d: SrDraft,
  time: number,
  action: string,
  to: Status | null,
  trigger: Trigger,
  actor: number | null,
  comment: string | null = null,
  payload: Record<string, unknown> | null = null,
): void {
  const from = d.cur
  const next = to ?? from
  if (next === null) throw new Error(`${action} before import`)
  const last = d.events.at(-1)
  if (last && time <= last.at)
    throw new Error(`SR ${d.seq} (${d.sc.key}): ${action} not after ${last.action}`)
  d.events.push({ at: time, action, from, to: next, trigger, actor, comment, payload })
  d.cur = next
}

function importSr(d: SrDraft, day: string): void {
  d.importedAt = at(day, 6, 30, int(0, 540))
  d.lastImportedAt = d.importedAt
  d.openedAt = d.importedAt - int(2, 70) * HOUR
  ev(d, d.importedAt, 'import_create', d.vip ? 'imported_vip' : 'imported', 'import', null, null, {
    procurementType: d.procurement,
  })
}

const MAIL_STEPS = [
  ['send_reminder_1', 'reminder_1_sent'],
  ['send_reminder_2', 'reminder_2_sent'],
  ['escalate', 'escalated'],
] as const
/** First chain mail on `firstDay` (job), then `depth` follow-ups every 5 days (SPEC §5.2 defaults). */
function mailChain(
  d: SrDraft,
  firstDay: string,
  depth: number,
  manualAt: number | null = null,
): string {
  const first = d.campus ? 'send_campus_info' : 'send_invitation'
  const firstTo: Status = d.campus ? 'campus_info_sent' : 'invited'
  if (manualAt === null) ev(d, jobAt(firstDay), first, firstTo, 'job', null)
  else ev(d, manualAt, first, firstTo, 'user', DANA)
  let lastDay = firstDay
  for (let step = 0; step < depth; step++) {
    const [action, to] = at0(MAIL_STEPS, step)
    lastDay = addDays(firstDay, 5 * (step + 1))
    ev(d, jobAt(lastDay), action, to, 'job', null)
  }
  d.communicationDay = lastDay
  return lastDay
}

const usedSlots = new Set<string>()
/** Riverton route on D0 and wd(−1) belongs to Theo's tours. */
const reservedCalendarDays = new Set([
  `${RIVERTON.calendarId}|${D0}`,
  `${RIVERTON.calendarId}|${wd(-1)}`,
])
const SLOT_TIMES: readonly (readonly [number, number])[] = [
  [8, 0],
  [9, 0],
  [10, 0],
  [11, 0],
  [12, 0],
  [13, 0],
  [14, 0],
]
function calendarFor(d: SrDraft): number {
  return must(d.region, 'region for calendar').calendarId
}
function takeSlot(
  calendarId: number,
  days: readonly string[],
  fixed: readonly [number, number] | null = null,
): Slot {
  const dayOrder = fixed ? days : shuffle(days)
  for (const day of dayOrder) {
    if (!fixed && reservedCalendarDays.has(`${calendarId}|${day}`)) continue
    for (const [hour, minute] of fixed ? [fixed] : shuffle(SLOT_TIMES)) {
      const key = `${calendarId}|${day}|${hour}:${minute}`
      if (usedSlots.has(key)) continue
      usedSlots.add(key)
      const start = at(day, hour, minute)
      return { day, start, end: start + HOUR, calendarId }
    }
  }
  throw new Error(`No free slot on calendar ${calendarId}`)
}

/**
 * Import → chain mails → booking (sync, or by phone for Campus) on a working day no later than
 * `latestBookDay` and before the anchor day (bookings are never later than the seed clock).
 */
function preBook(d: SrDraft, slot: Slot, latestBookDay: string): void {
  const cap = workdayOnOrBefore(minDay(latestBookDay, addDays(T, -1)))
  let bookDay = addWorkdays(slot.day, -int(2, 7))
  if (bookDay > cap) bookDay = addWorkdays(cap, -int(0, 2))
  const depth =
    d.campus || d.vip
      ? 0
      : weighted([
          [0, 70],
          [1, 20],
          [2, 10],
        ] as const)
  const lastMailDay = addDays(bookDay, -int(0, 2))
  const importDay = workdayOnOrBefore(addDays(lastMailDay, -(1 + 5 * depth) - (d.vip ? 3 : 0)))
  importSr(d, importDay)
  let firstMailDay = addDays(importDay, 1)
  if (d.vip) {
    const releaseDay = addWorkdays(importDay, 1)
    ev(d, at(releaseDay, 9, int(0, 50)), 'release_vip', 'imported', 'user', DANA)
    firstMailDay = addDays(releaseDay, 1)
  }
  const lastMail = mailChain(d, firstMailDay, depth)
  const day = bookDay < lastMail ? lastMail : bookDay
  const payload = { calendarId: slot.calendarId, startAt: iso(slot.start), endAt: iso(slot.end) }
  if (d.campus) {
    ev(
      d,
      at(day, int(10, 15), int(0, 59)),
      'book_appointment',
      'appointment_booked',
      'user',
      DANA,
      null,
      payload,
    )
  } else {
    ev(
      d,
      at(day, int(8, 19), int(0, 59)),
      'appointment_synced',
      'appointment_booked',
      'sync',
      null,
      null,
      payload,
    )
  }
  d.appointment = slot
}

function claim(d: SrDraft, time: number, editor: number): void {
  ev(d, time, 'claim', 'personalization_in_progress', 'user', editor)
  d.claimedAt = time
  d.editorId = editor
}
/** Assigns new items between `from` and `to` (each with probability `share`). */
function assignItems(d: SrDraft, from: number, to: number, editor: number, share = 1): void {
  const items = newItems(d)
  let cursor = from
  const stepMinutes = Math.max(2, Math.floor((to - from) / MINUTE / (items.length + 1)))
  for (const it of items) {
    cursor += int(Math.floor(stepMinutes / 2), stepMinutes) * MINUTE + int(0, 59) * 1000
    if (share < 1 && !chance(share)) continue
    it.assignedAt = Math.min(cursor, to - MINUTE)
    it.assignedBy = editor
  }
}
function finish(d: SrDraft, time: number, editor: number): void {
  ev(d, time, 'finish_personalization', 'personalization_done', 'user', editor)
  d.personalizedAt = time
  d.editorId = null
}
function closeOrder(d: SrDraft, time: number): void {
  ev(d, time, 'close_order', 'ready_for_picking', 'user', pick([DANA, ADA]))
  d.orderClosedAt = time
}

/** Booking → claim → assignment → finish → order closing, with the order closed on `closeDay`. */
function stageThrough(d: SrDraft, slot: Slot, closeDay: string): void {
  if (newItems(d).length === 0) {
    // Removal: nothing to prepare, the dispatcher skips preparation (SPEC §4.1.1 #20).
    preBook(d, slot, addWorkdays(closeDay, -1))
    const time = at(closeDay, int(14, 16), int(0, 59))
    ev(d, time, 'skip_preparation', 'ready_for_picking', 'user', DANA)
    d.withoutAssetPrep = true
    d.orderClosedAt = time
    return
  }
  const finishDay = addWorkdays(closeDay, -int(0, 1))
  const claimedAt = at(finishDay, 8, int(0, 59))
  const finishedAt = claimedAt + int(2, 4) * HOUR + int(0, 59) * MINUTE
  const closedAt =
    finishDay === closeDay
      ? finishedAt + int(1, 2) * HOUR + int(0, 59) * MINUTE
      : at(closeDay, int(13, 15), int(0, 59))
  preBook(d, slot, addWorkdays(finishDay, -1))
  const editor = pick([DANA, DANA, ADA])
  claim(d, claimedAt, editor)
  assignItems(d, claimedAt, finishedAt, editor)
  finish(d, finishedAt, editor)
  closeOrder(d, closedAt)
  d.softwareStage = 'done'
}
function provide(d: SrDraft, time: number): void {
  ev(d, time, 'mark_provided', 'provided', 'user', DANA)
  d.providedAt = time
}
function ship(d: SrDraft, time: number): void {
  for (const it of newItems(d)) {
    it.packedAt = time - int(15, 45) * MINUTE
    it.packedBy = DANA
  }
  ev(d, time, 'ship', 'shipped', 'user', DANA, null, {
    includeReturnLabel: oldItems(d).length > 0,
    combinedParcel: false,
    sendConfirmation: true,
  })
  d.shippedAt = time
}
function technicianFor(d: SrDraft): number {
  return userId(must(d.region, 'region').technician)
}
function displayName(contact: ContactDraft): string {
  return `${contact.row.firstName ?? ''} ${contact.row.lastName}`.trim()
}

/** Delivery leg up to the visit: parcel → packed and shipped 2 working days ahead, else provided. */
function deliver(d: SrDraft, slot: Slot): void {
  if (d.deliveryType === 'technician') {
    stageThrough(d, slot, addWorkdays(slot.day, -1))
    provide(d, at(slot.day, 7, int(2, 25), int(0, 59)))
  } else {
    const shipDay = addWorkdays(slot.day, -2)
    stageThrough(d, slot, addWorkdays(shipDay, -1))
    ship(d, at(shipDay, int(14, 16), int(0, 59)))
  }
}

function planSr(d: SrDraft): void {
  const key = d.sc.key
  switch (d.sc.status) {
    case 'imported':
      importSr(d, key === 'unresolved' || key === 'no-email' ? pwd(-int(1, 2)) : P0)
      d.itsmState = 'Open'
      break
    case 'imported_vip':
      importSr(d, pwd(-int(2, 8)))
      d.itsmState = 'Open'
      break
    case 'hardware_unavailable': {
      if (key === 'hold-manual') {
        const importDay = pwd(-int(4, 6))
        importSr(d, importDay)
        const inviteDay = addDays(importDay, 1)
        mailChain(d, inviteDay, 0)
        const holdDay = minDay(addWorkdays(inviteDay, int(1, 2)), P0)
        const time = at(holdDay, 10, int(0, 59))
        ev(
          d,
          time,
          'mark_hardware_unavailable',
          'hardware_unavailable',
          'user',
          DANA,
          'Supplier backorder on Laptop Workstation 15 — hold until delivery',
        )
        d.holdSource = 'manual'
        d.holdNotifiedAt = time
      } else {
        importSr(d, key === 'hold-left' ? pwd(-int(8, 12)) : pwd(-int(2, 9)))
        const time = d.importedAt + 4000
        ev(d, time, 'mark_hardware_unavailable', 'hardware_unavailable', 'import', null)
        d.holdSource = 'import'
        d.holdNotifiedAt = time
        if (key === 'hold-import') d.assignmentGroup = HOLD_GROUP
        else d.lastImportedAt = at(pwd(-1), 6, 30, int(0, 540))
      }
      d.itsmState = 'On Hold'
      break
    }
    case 'invited':
    case 'campus_info_sent':
    case 'reminder_1_sent':
    case 'reminder_2_sent':
    case 'escalated': {
      const depth = {
        invited: 0,
        campus_info_sent: 0,
        reminder_1_sent: 1,
        reminder_2_sent: 2,
        escalated: 3,
      }[d.sc.status]
      const [min, max] =
        key === 'paused' || key === 'stale'
          ? [-12, -8]
          : key === 'paused-until'
            ? [-10, -7]
            : d.sc.status === 'campus_info_sent'
              ? [-9, -1]
              : d.sc.status === 'invited' || d.sc.status === 'escalated'
                ? [-4, -1]
                : [-4, 0]
      const lastMailDay = addDays(T, int(min, max))
      const firstMailDay = addDays(lastMailDay, -5 * depth)
      const importDay = workdayOnOrBefore(addDays(firstMailDay, -1))
      importSr(d, importDay)
      const manual = d.sc.status === 'invited' && key === 'plain' && chance(0.25)
      if (manual) mailChain(d, importDay, 0, at(importDay, int(10, 15), int(0, 59)))
      else mailChain(d, firstMailDay, depth)
      if (key === 'paused' || key === 'paused-until') {
        const pauseDay = addWorkdays(must(d.communicationDay, 'mail day'), 2)
        const reason =
          key === 'paused-until'
            ? 'User travelling; resume after return'
            : d.sc.status === 'invited'
              ? 'User on parental leave; HR will advise'
              : 'Long-term sick leave; resume when back'
        d.resumeDate = key === 'paused-until' ? addDays(T, int(3, 10)) : null
        d.paused = key === 'paused'
        d.pauseReason = reason
        ev(d, at(pauseDay, 11, int(0, 59)), 'pause_communication', null, 'user', DANA, null, {
          reason,
          resumeDate: d.resumeDate,
        })
      }
      d.itsmState = 'Work in Progress'
      break
    }
    case 'appointment_booked': {
      const days =
        key === 'soon'
          ? [wd(1)]
          : key === 'this-week'
            ? [wd(2)]
            : key === 'campus'
              ? [wd(3)]
              : key === 'vip-released'
                ? [wd(8)]
                : wdRange(2, 12)
      preBook(d, takeSlot(calendarFor(d), days), P0)
      break
    }
    case 'personalization_in_progress': {
      const slot = takeSlot(calendarFor(d), wdRange(1, 5))
      const claimedAt = at(pwd(-1), int(13, 15), int(0, 59))
      preBook(d, slot, pwd(-2))
      const editor = d.seq % 4 === 0 ? ADA : DANA
      claim(d, claimedAt, editor)
      assignItems(d, claimedAt, claimedAt + 2 * HOUR, editor, 0.6)
      const items = newItems(d)
      if (items.length > 1 && items.every((it) => it.assignedAt !== null)) {
        const lastItem = at0(items, items.length - 1)
        lastItem.assignedAt = null
        lastItem.assignedBy = null
      }
      d.softwareStage = 'partial'
      d.assetStage = 'assigned'
      break
    }
    case 'personalization_done': {
      const slot = takeSlot(calendarFor(d), wdRange(1, 4))
      const claimDay = pwd(-int(1, 2))
      const claimedAt = at(claimDay, 8, int(0, 59))
      const finishedAt = claimedAt + int(2, 5) * HOUR
      preBook(d, slot, addWorkdays(claimDay, -1))
      const editor = pick([DANA, DANA, ADA])
      claim(d, claimedAt, editor)
      assignItems(d, claimedAt, finishedAt, editor)
      finish(d, finishedAt, editor)
      d.softwareStage = key === 'software-open' ? 'open' : 'done'
      d.assetStage = 'assigned'
      break
    }
    case 'ready_for_picking': {
      const slot = takeSlot(calendarFor(d), wdRange(0, 3))
      if (key === 'skip-prep') {
        const claimedAt = at(pwd(-2), 9, int(0, 59))
        preBook(d, slot, pwd(-3))
        claim(d, claimedAt, DANA)
        assignItems(d, claimedAt, claimedAt + 80 * MINUTE, DANA)
        const time = claimedAt + 2 * HOUR
        ev(d, time, 'skip_preparation', 'ready_for_picking', 'user', DANA)
        d.withoutAssetPrep = true
        d.editorId = null
        d.orderClosedAt = time
        d.softwareStage = 'done'
      } else {
        stageThrough(d, slot, pwd(-1))
      }
      d.assetStage = 'prepared'
      break
    }
    case 'shipped': {
      const slot = takeSlot(calendarFor(d), wdRange(0, 2))
      const shipDay = minDay(addWorkdays(slot.day, -2), pwd(-1))
      stageThrough(d, slot, addWorkdays(shipDay, -1))
      ship(d, at(shipDay, int(14, 16), int(0, 59)))
      if (key === 'itsm-closed') {
        d.itsmState = 'Closed Complete'
        d.lastImportedAt = at(pwd(-1), 6, 30, int(0, 540))
      }
      d.assetStage = 'provided'
      break
    }
    case 'provided': {
      const theo = key === 'theo'
      const slot = theo
        ? takeSlot(RIVERTON.calendarId, [D0], at0(THEO_TODAY, d.seq % THEO_TODAY.length))
        : takeSlot(calendarFor(d), [wd(-2)])
      const provideAt =
        theo && !isWorkday(T)
          ? at(P0, 16, int(0, 30))
          : at(slot.day, 7, theo ? int(0, 8) : int(2, 25), int(0, 59))
      stageThrough(d, slot, addWorkdays(zurichDay(provideAt), -1))
      provide(d, provideAt)
      d.assetStage = 'provided'
      break
    }
    case 'reschedule_needed':
      planReschedule(d)
      break
    case 'completed':
      planCompleted(d)
      break
    case 'cancelled':
      planCancelled(d)
      break
  }
  if (d.cur !== d.sc.status)
    throw new Error(`SR ${d.seq} ended in ${d.cur ?? 'nothing'}, expected ${d.sc.status}`)
  if (d.itsmState === '') d.itsmState = 'Work in Progress'
}

function planReschedule(d: SrDraft): void {
  switch (d.sc.key) {
    case 'resume-booked': {
      const slot = takeSlot(calendarFor(d), wdRange(2, 5))
      preBook(d, slot, pwd(-2))
      ev(
        d,
        at(pwd(-1), 18, int(0, 59)),
        'appointment_cancelled',
        'reschedule_needed',
        'sync',
        null,
        null,
        {
          calendarId: slot.calendarId,
          startAt: iso(slot.start),
        },
      )
      d.resumeStatus = 'appointment_booked'
      break
    }
    case 'resume-done': {
      const slot = takeSlot(calendarFor(d), wdRange(1, 3))
      const claimedAt = at(pwd(-3), 8, int(0, 59))
      const finishedAt = claimedAt + 3 * HOUR
      preBook(d, slot, pwd(-4))
      claim(d, claimedAt, DANA)
      assignItems(d, claimedAt, finishedAt, DANA)
      finish(d, finishedAt, DANA)
      ev(
        d,
        at(pwd(-1), 11, int(0, 59)),
        'request_reschedule',
        'reschedule_needed',
        'user',
        DANA,
        null,
        {
          reason: 'User on sick leave this week',
          notifyUser: true,
          cancelAtProvider: true,
        },
      )
      d.resumeStatus = 'personalization_done'
      d.softwareStage = 'done'
      d.assetStage = 'assigned'
      break
    }
    case 'resume-picking': {
      // Theo's stop at 11:00 yesterday: user not present (DV04); devices back to goods out.
      const slot = takeSlot(RIVERTON.calendarId, [wd(-1)], [11, 0])
      stageThrough(d, slot, wd(-2))
      provide(d, at(slot.day, 7, int(2, 25), int(0, 59)))
      ev(
        d,
        slot.start + 25 * MINUTE,
        'reschedule_on_site',
        'reschedule_needed',
        'user',
        THEO,
        null,
        {
          deviationCodeId: 4,
        },
      )
      d.finisher = THEO
      d.deviationId = 4
      d.resumeStatus = 'ready_for_picking'
      d.assetStage = 'returned'
      break
    }
    case 'resume-shipped': {
      const slot = takeSlot(calendarFor(d), [wd(-2)], [10, 0])
      const shipDay = wd(-4)
      stageThrough(d, slot, addWorkdays(shipDay, -1))
      ship(d, at(shipDay, 15, int(0, 59)))
      ev(
        d,
        slot.start + 20 * MINUTE,
        'reschedule_on_site',
        'reschedule_needed',
        'user',
        JONAS,
        null,
        {
          deviationCodeId: 5,
        },
      )
      d.finisher = JONAS
      d.deviationId = 5
      d.resumeStatus = 'shipped'
      d.assetStage = 'provided'
      break
    }
    default:
      throw new Error(`Unknown reschedule scenario ${d.sc.key}`)
  }
  d.appointment = null
}

function planCompleted(d: SrDraft): void {
  const key = d.sc.key
  const cal = d.campus ? RIVERTON.calendarId : calendarFor(d)
  const slot =
    key === 'theo'
      ? takeSlot(cal, [wd(-1)], at0(THEO_YESTERDAY, d.seq % THEO_YESTERDAY.length))
      : takeSlot(cal, key === 'closed-complete' ? wdRange(-25, -6) : wdRange(-25, -2))
  deliver(d, slot)
  const technician = technicianFor(d)
  if (key === 'manual') {
    const time = slot.end + int(60, 180) * MINUTE
    ev(
      d,
      time,
      'complete_manually',
      'completed',
      'user',
      DANA,
      'Technician confirmed the handover by phone; scanning was not possible on site.',
    )
    d.completedAt = time
    d.finisher = DANA
  } else {
    let cursor = slot.start + int(5, 10) * MINUTE
    for (const it of d.items) {
      if (key === 'dv10' && it.slot.startsWith('old_')) continue
      it.verifiedAt = cursor
      it.verifiedBy = technician
      cursor += int(3, 9) * MINUTE
    }
    const deviation = { dv10: 10, dv12: 12, dv13: 13, dv14: 14 }[key] ?? null
    const comment =
      deviation === 10
        ? 'User keeps the old laptop until the data migration is finished.'
        : deviation === 14
          ? 'Docking station not connected — LAN port at the desk is dead; facility ticket raised.'
          : null
    const time = Math.max(cursor, slot.start + 40 * MINUTE) + int(1, 9) * MINUTE
    ev(d, time, 'complete_deployment', 'completed', 'user', technician, null, {
      recipientName: displayName(d.contact),
      handoverConfirmed: newItems(d).length > 0,
      deviationCodeId: deviation,
      deviationComment: comment,
      sendProtocol: true,
    })
    d.completedAt = time
    d.finisher = technician
    d.deviationId = deviation
    d.deviationComment = comment
  }
  if (key === 'closed-complete') {
    d.itsmState = 'Closed Complete'
    d.lastImportedAt = at(pwd(-1), 6, 30, int(0, 540))
  }
  d.assetStage = 'deployed'
}

function planCancelled(d: SrDraft): void {
  switch (d.sc.key) {
    case 'on-site': {
      const slot = takeSlot(calendarFor(d), [wd(-3)])
      deliver(d, slot)
      const time = slot.start + 20 * MINUTE
      const comment = 'User refused the exchange and keeps the current device until project end.'
      ev(d, time, 'cancel_on_site', 'cancelled', 'user', TARA, null, {
        deviationCodeId: 16,
        deviationComment: comment,
      })
      d.cancelledAt = time
      d.finisher = TARA
      d.deviationId = 16
      d.deviationComment = comment
      d.assetStage = 'released'
      break
    }
    case 'dispatcher-invited': {
      const inviteDay = addDays(T, -int(8, 12))
      importSr(d, workdayOnOrBefore(addDays(inviteDay, -1)))
      mailChain(d, inviteDay, 0)
      const time = at(minDay(addWorkdays(inviteDay, int(1, 2)), P0), 14, int(0, 59))
      ev(
        d,
        time,
        'cancel',
        'cancelled',
        'user',
        DANA,
        "Duplicate request — merged with the requester's other order.",
      )
      d.cancelledAt = time
      break
    }
    case 'dispatcher-booked': {
      preBook(d, takeSlot(calendarFor(d), wdRange(3, 6)), pwd(-2))
      const time = at(pwd(-1), 10, int(0, 59))
      ev(
        d,
        time,
        'cancel',
        'cancelled',
        'user',
        DANA,
        'User left the company; order withdrawn by the cost-centre manager.',
      )
      d.cancelledAt = time
      d.appointment = null
      break
    }
    case 'itsm': {
      const reminderDay = addDays(T, -int(4, 5))
      const inviteDay = addDays(reminderDay, -5)
      importSr(d, workdayOnOrBefore(addDays(inviteDay, -1)))
      mailChain(d, inviteDay, 1)
      const time = at(pwd(-1), 6, 30, int(0, 540))
      ev(d, time, 'cancel', 'cancelled', 'import', null, 'Cancelled in ITSM')
      d.cancelledAt = time
      d.lastImportedAt = time
      d.itsmState = 'Cancelled'
      break
    }
    default:
      throw new Error(`Unknown cancel scenario ${d.sc.key}`)
  }
  d.appointment = null
}

// ---- build the SR drafts ----

const srDrafts: SrDraft[] = SCENARIOS.map((sc, seq) => {
  const { region, campus } = chooseRegion(sc)
  const contact =
    sc.vip === undefined
      ? createContact({ region, campus, noEmail: sc.noEmail === true })
      : vipContact(sc.vip, region, campus)
  const d: SrDraft = {
    seq,
    sc,
    contact,
    region,
    campus,
    vip: sc.vip !== undefined,
    procurement:
      sc.procurement ??
      weighted<ProcurementType>([
        ['replacement', 70],
        ['new_hire', 15],
        ['additional_device', 10],
      ]),
    ruleId: null,
    deliveryType: null,
    supplyingSiteId: null,
    items: [],
    events: [],
    cur: null,
    importedAt: 0,
    lastImportedAt: 0,
    openedAt: 0,
    itsmState: '',
    assignmentGroup:
      region === null ? 'Workplace Rollout' : `Rollout ${siteById(region.siteId).label}`,
    communicationDay: null,
    paused: false,
    pauseReason: null,
    resumeDate: null,
    holdNotifiedAt: null,
    holdSource: null,
    appointment: null,
    claimedAt: null,
    editorId: null,
    personalizedAt: null,
    orderClosedAt: null,
    providedAt: null,
    shippedAt: null,
    completedAt: null,
    cancelledAt: null,
    finisher: null,
    deviationId: null,
    deviationComment: null,
    resumeStatus: null,
    withoutAssetPrep: false,
    osReinstall: null,
    requestedSoftware: [],
    addedSoftware: [],
    installedSoftware: [],
    softwareStage: 'none',
    note: chance(0.25) ? pick(SR_NOTES) : null,
    onsitePhone: chance(0.3) ? phone() : null,
    assetStage: 'none',
    id: 0,
    number: '',
    taskNumber: '',
  }
  resolveRegion(d)
  buildItems(d)
  d.requestedSoftware = shuffle(SOFTWARE).slice(0, int(0, 3))
  return d
})
for (const d of srDrafts) planSr(d)

// Software checklists and OS reinstall timing, by stage.
for (const d of srDrafts) {
  if (d.softwareStage === 'none') continue
  if (d.softwareStage === 'open' && d.requestedSoftware.length < 2) {
    d.requestedSoftware = shuffle(SOFTWARE).slice(0, 2)
  }
  if (chance(0.25)) {
    const extra = SOFTWARE.find((name) => !d.requestedSoftware.includes(name))
    if (extra) d.addedSoftware = [extra]
  }
  const required = [...d.requestedSoftware, ...d.addedSoftware]
  d.installedSoftware =
    d.softwareStage === 'done'
      ? required
      : d.softwareStage === 'open'
        ? required.slice(0, -1)
        : required.filter(() => chance(0.5))
  if (chance(0.3))
    d.osReinstall = d.procurement === 'replacement' && chance(0.5) ? 'on_pickup' : 'on_delivery'
}

// Number SRs in import order (SPEC §11.2: SR0012001… ordered by imported_at).
srDrafts.sort((a, b) => a.importedAt - b.importedAt || a.seq - b.seq)
srDrafts.forEach((d, index) => {
  d.id = index + 1
  d.number = `SR${pad(12001 + index, 7)}`
  d.taskNumber = `TASK${pad(45001 + index, 7)}`
})

// ---- stock-matrix story (SPEC §11.4): Hillford short on Laptop Performance 16, Eastgate short
// on Monitor 34 Ultrawide and Docking Station Thunderbolt ----

function setItemType(d: SrDraft, slot: ItemSlot, type: string): void {
  const existing = d.items.find((it) => it.slot === slot)
  if (existing) {
    existing.requestedType = type
    existing.article = articleForType(type)
  } else {
    d.items.push(newItem(slot, type))
  }
}
function storyCandidates(siteId: number): SrDraft[] {
  return srDrafts.filter(
    (d) =>
      d.supplyingSiteId === siteId &&
      d.procurement !== 'removal' &&
      d.sc.key !== 'unknown-article' &&
      (PRE_ASSET_DEMAND.includes(d.sc.status) || d.sc.key === 'resume-booked'),
  )
}
for (const d of storyCandidates(HIL).slice(0, 3))
  setItemType(d, 'new_base', 'Laptop Performance 16')
for (const d of storyCandidates(EAS).slice(0, 3))
  setItemType(d, 'new_peripheral_2', 'Monitor 34 Ultrawide')
for (const d of storyCandidates(EAS).slice(-3))
  setItemType(d, 'new_peripheral_1', 'Docking Station Thunderbolt')
// Eastgate holds no Monitor 34 Ultrawide at all: SRs with devices at the hub get a Monitor 27.
for (const d of srDrafts) {
  if (d.supplyingSiteId !== EAS || !['assigned', 'prepared', 'returned'].includes(d.assetStage))
    continue
  const it = d.items.find((entry) => entry.slot === 'new_peripheral_2')
  if (it?.requestedType === 'Monitor 34 Ultrawide') setItemType(d, 'new_peripheral_2', 'Monitor 27')
}
for (const d of srDrafts) {
  d.items.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
}

// =================================================================================================
// Assets and movements
// =================================================================================================

interface MoveDraft {
  at: number
  action: AssetAction
  fromStatus: AssetStatus | null
  toStatus: AssetStatus
  fromLocation: LocationDef | null
  toLocation: LocationDef
  fromPlace: string | null
  toPlace: string | null
  sr: SrDraft | null
  actor: number | null
  trigger: Trigger
  reason: string | null
  sourceRef: string | null
}
interface AssetDraft {
  seq: number
  article: ArticleDef
  serial: string
  tag: string
  mac: string | null
  orderNumber: string
  status: AssetStatus | null
  location: LocationDef | null
  place: string | null
  sr: SrDraft | null
  contact: ContactDraft | null
  /** Old devices: the employee the device was issued to (kept after collection). */
  owner: ContactDraft | null
  checkedInAt: number
  createdAt: number
  moves: MoveDraft[]
  id: number
}
const assets: AssetDraft[] = []
const serials = new Set<string>()
const tags = new Set<string>()
const macs = new Set<string>()
const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function newSerial(article: ArticleDef): string {
  for (;;) {
    let serial = article.prefix
    for (let i = 0; i < 8; i++) serial += BASE32.charAt(int(0, 31))
    if (!serials.has(serial)) {
      serials.add(serial)
      return serial
    }
  }
}
function newTag(kind: 'old' | 'new'): string {
  for (;;) {
    const tag = `GX${kind === 'old' ? 1 : 2}${pad(int(0, 99999), 5)}`
    if (!tags.has(tag)) {
      tags.add(tag)
      return tag
    }
  }
}
function newMac(article: ArticleDef): string | null {
  if (article.category !== 'laptop' && article.category !== 'docking_station') return null
  for (;;) {
    const bytes = [int(0, 255), int(0, 255), int(0, 255)]
    const mac = `02:00:5E:${bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(':')}`
    if (!macs.has(mac)) {
      macs.add(mac)
      return mac
    }
  }
}
const orderNumbers = new Map<string, string>()
function orderNumberFor(batch: string, old: boolean): string {
  const existing = orderNumbers.get(batch)
  if (existing) return existing
  const value = `ORD-${old ? int(100000, 199999) : int(300000, 399999)}`
  orderNumbers.set(batch, value)
  return value
}

function createAsset(
  article: ArticleDef,
  kind: 'old' | 'new',
  createdAt: number,
  checkedInAt: number,
  batch: string,
): AssetDraft {
  const asset: AssetDraft = {
    seq: assets.length,
    article,
    serial: newSerial(article),
    tag: newTag(kind),
    mac: newMac(article),
    orderNumber: orderNumberFor(batch, kind === 'old'),
    status: null,
    location: null,
    place: null,
    sr: null,
    contact: null,
    owner: null,
    checkedInAt,
    createdAt,
    moves: [],
    id: 0,
  }
  assets.push(asset)
  return asset
}

interface MoveOptions {
  place?: string | null
  sr?: SrDraft | null
  contact?: ContactDraft | null
  actor?: number | null
  reason?: string | null
  sourceRef?: string | null
}
function move(
  asset: AssetDraft,
  time: number,
  action: AssetAction,
  toStatus: AssetStatus,
  toLocation: LocationDef,
  trigger: Trigger,
  options: MoveOptions = {},
): void {
  const last = asset.moves.at(-1)
  if (last && time <= last.at)
    throw new Error(`Asset ${asset.serial}: ${action} not after ${last.action}`)
  const toPlace =
    options.place === undefined
      ? toLocation.type === 'staging'
        ? asset.place
        : null
      : options.place
  const context = options.sr === undefined ? asset.sr : options.sr
  asset.sr =
    action === 'release' || action === 'unassign' || action === 'deactivate' ? null : context
  asset.moves.push({
    at: time,
    action,
    fromStatus: asset.status,
    toStatus,
    fromLocation: asset.location,
    toLocation,
    fromPlace: asset.place,
    toPlace,
    sr: context,
    actor: options.actor ?? null,
    trigger,
    reason: options.reason ?? null,
    sourceRef: options.sourceRef ?? null,
  })
  asset.status = toStatus
  asset.location = toLocation
  asset.place = toPlace
  if (options.contact !== undefined) asset.contact = options.contact
  else if (toStatus !== 'in_use') asset.contact = null
}

const usedPlaces = new Map<number, Set<string>>()
function takePlace(siteId: number, category: ArticleCategory): string {
  const rows =
    category === 'laptop' || category === 'desktop' || category === 'tablet'
      ? ['A', 'B']
      : category === 'docking_station'
        ? ['C']
        : category === 'monitor'
          ? ['D', 'E']
          : ['F']
  const used = usedPlaces.get(siteId) ?? new Set<string>()
  usedPlaces.set(siteId, used)
  for (;;) {
    const place = `${pick(rows)}${int(1, 6)}-${pad(int(1, 40), 2)}`
    if (!used.has(place)) {
      used.add(place)
      return place
    }
  }
}

/** Receive into hub goods in (import), then optionally place in staging (scan). */
function receiveStock(
  article: ArticleDef,
  siteId: number,
  receivedDay: string,
  placeInStaging: boolean,
): AssetDraft {
  const receivedAt = at(receivedDay, 10, int(0, 59), int(0, 59))
  const asset = createAsset(article, 'new', receivedAt, receivedAt, `${siteId}|${receivedDay}`)
  move(asset, receivedAt, 'receive', 'available', locationOf(siteId, 'goods_in'), 'import', {
    place: null,
  })
  if (placeInStaging) {
    const placeDay = addWorkdays(receivedDay, int(0, 1))
    const placedAt =
      placeDay === receivedDay
        ? at(placeDay, 14, int(0, 59), int(0, 59))
        : at(placeDay, 9, int(0, 59), int(0, 59))
    move(asset, placedAt, 'place', 'available', locationOf(siteId, 'staging'), 'user', {
      place: takePlace(siteId, article.category),
      actor: pick(must(HUB_SCANNERS[siteId], 'scanner')),
      sourceRef: 'scan:installation_place',
    })
  }
  return asset
}

// ---- old devices (initial asset status sync) ----

const INITIAL_SYNC_DAY = workdayOnOrBefore(addDays(T, -90))
let initialSyncSecond = 0
function oldDevice(article: ArticleDef, contact: ContactDraft): AssetDraft {
  const createdAt = at(INITIAL_SYNC_DAY, 6, 40, initialSyncSecond++)
  const checkedInAt = at(workdayOnOrBefore(addDays(T, -int(700, 1400))), 10, int(0, 59))
  const asset = createAsset(article, 'old', createdAt, checkedInAt, `old|${int(1, 40)}`)
  asset.owner = contact
  move(asset, createdAt, 'sync_in_use', 'in_use', IN_USE, 'import', { contact })
  return asset
}

// ---- devices of service requests ----

for (const d of srDrafts) {
  const hub = d.supplyingSiteId
  for (const it of oldItems(d)) {
    const asset = oldDevice(must(it.oldArticle, 'old article'), d.contact)
    it.asset = asset
    if (d.sc.status === 'completed' && it.verifiedAt !== null && d.completedAt !== null) {
      const returns = d.campus ? locationOf(4, 'return') : locationOf(must(hub, 'hub'), 'return')
      move(asset, d.completedAt, 'collect', 'collected', returns, 'system', {
        sr: d,
        actor: d.finisher,
      })
    }
  }
  if (d.assetStage === 'none' || hub === null) continue
  for (const it of newItems(d)) {
    if (it.assignedAt === null || it.assignedBy === null) continue
    const article = must(it.article, 'article of an assigned item')
    const receivedDay = workdayOnOrBefore(addDays(zurichDay(it.assignedAt), -int(4, 40)))
    const asset = receiveStock(article, hub, receivedDay, true)
    move(asset, it.assignedAt, 'assign', 'assigned', locationOf(hub, 'staging'), 'user', {
      sr: d,
      actor: it.assignedBy,
    })
    it.asset = asset
    if (d.assetStage === 'assigned') continue
    const goodsOut = locationOf(hub, 'goods_out')
    const closer = must(
      d.events.find((e) => e.to === 'ready_for_picking'),
      'order closing event',
    )
    move(asset, must(d.orderClosedAt, 'order closed'), 'prepare', 'prepared', goodsOut, 'system', {
      actor: closer.actor,
    })
    if (d.assetStage === 'prepared') continue
    const handover = must(d.providedAt ?? d.shippedAt, 'handover time')
    move(asset, handover, 'provide', 'provided', IN_TRANSIT, 'system', { actor: DANA })
    if (d.assetStage === 'provided') continue
    const endAt = must(d.completedAt ?? d.cancelledAt ?? d.events.at(-1)?.at, 'visit end')
    if (d.assetStage === 'returned') {
      move(asset, endAt, 'return_to_hub', 'prepared', goodsOut, 'system', { actor: d.finisher })
    } else if (d.assetStage === 'deployed') {
      move(asset, endAt, 'deploy', 'in_use', IN_USE, 'system', {
        contact: d.contact,
        actor: d.finisher,
      })
    } else {
      move(asset, endAt, 'release', 'available', locationOf(hub, 'goods_in'), 'system', {
        place: null,
        actor: d.finisher,
      })
      // SPEC_RESOLUTIONS #50: cancelling clears the new items' asset links.
      it.asset = null
      it.assignedAt = null
      it.assignedBy = null
      it.packedAt = null
      it.packedBy = null
    }
  }
}

// =================================================================================================
// Lease returns (SPEC §11.5 ÷ 3) and historic devices
// =================================================================================================

interface LeaseEvent {
  at: number
  action: string
  from: LeaseReturnStatus | null
  to: LeaseReturnStatus
  trigger: Trigger
  actor: number | null
  comment: string | null
  payload: Record<string, unknown> | null
}
interface LeaseDraft {
  seq: number
  key: string
  target: LeaseReturnStatus
  contact: ContactDraft
  asset: AssetDraft
  sr: SrDraft | null
  vip: boolean
  retirement: string
  importedAt: number
  lastSeenAt: number
  events: LeaseEvent[]
  cur: LeaseReturnStatus | null
  communicationDay: string | null
  infoSentAt: number | null
  reminder1SentAt: number | null
  reminder2SentAt: number | null
  escalationSentAt: number | null
  escalationEmail: string | null
  linkedAt: number | null
  closedAt: number | null
  closeReason: string | null
  installStatus: string
  id: number
}
const leases: LeaseDraft[] = []
/** Lease imports by Dana (SPEC §11.7): the latest one (T−8) marked missing rows probably closed. */
const LEASE_IMPORTS = [-68, -38, -8].map((offset) =>
  at(workdayOnOrBefore(addDays(T, offset)), 8, 15),
)
const LATEST_LEASE_IMPORT = at0(LEASE_IMPORTS, 2)

function lev(
  l: LeaseDraft,
  time: number,
  action: string,
  to: LeaseReturnStatus | null,
  trigger: Trigger,
  actor: number | null,
  comment: string | null = null,
  payload: Record<string, unknown> | null = null,
): void {
  const from = l.cur
  const next = to ?? from
  if (next === null) throw new Error(`${action} before lease import`)
  const last = l.events.at(-1)
  if (last && time <= last.at)
    throw new Error(`Lease ${l.seq} (${l.key}): ${action} not after ${last.action}`)
  l.events.push({ at: time, action, from, to: next, trigger, actor, comment, payload })
  l.cur = next
}

/** Daily lease chain (SPEC §6.3 defaults: info 42 days before retirement, then every 7 days). */
function leaseChain(l: LeaseDraft, until: number): void {
  if (l.vip || l.contact.row.email === null) return
  let day = addDays(zurichDay(l.importedAt), 1)
  const windowDay = addDays(l.retirement, -42)
  if (windowDay > day) day = windowDay
  const steps = [
    ['send_info', 'info_sent'],
    ['send_reminder_1', 'reminder_1_sent'],
    ['send_reminder_2', 'reminder_2_sent'],
    ['escalate', 'escalated'],
  ] as const
  for (const [action, status] of steps) {
    const time = jobAt(day)
    if (time > until) return
    lev(l, time, action, status, 'job', null)
    if (status === 'info_sent') l.infoSentAt = time
    if (status === 'reminder_1_sent') l.reminder1SentAt = time
    if (status === 'reminder_2_sent') l.reminder2SentAt = time
    if (status === 'escalated') l.escalationSentAt = time
    l.communicationDay = day
    day = addDays(day, 7)
  }
}

function createLease(
  key: string,
  target: LeaseReturnStatus,
  contact: ContactDraft,
  asset: AssetDraft,
  retirement: string,
  importedAt: number,
  sr: SrDraft | null = null,
): LeaseDraft {
  const l: LeaseDraft = {
    seq: leases.length,
    key,
    target,
    contact,
    asset,
    sr,
    vip: isVipContact(contact),
    retirement,
    importedAt: importedAt + leases.length * 1000,
    lastSeenAt: 0,
    events: [],
    cur: null,
    communicationDay: null,
    infoSentAt: null,
    reminder1SentAt: null,
    reminder2SentAt: null,
    escalationSentAt: null,
    escalationEmail: null,
    linkedAt: null,
    closedAt: null,
    closeReason: null,
    installStatus: 'In use',
    id: 0,
  }
  lev(l, l.importedAt, 'import_create', l.vip ? 'imported_vip' : 'imported', 'import', null)
  l.lastSeenAt = Math.max(l.importedAt, LATEST_LEASE_IMPORT + leases.length * 1000)
  leases.push(l)
  return l
}
function latestLeaseImportBefore(time: number): number {
  return [...LEASE_IMPORTS].reverse().find((importAt) => importAt < time) ?? at0(LEASE_IMPORTS, 0)
}
function leaseOnlyContact(campus = false, noEmail = false): ContactDraft {
  const region = campus
    ? RIVERTON
    : weighted(REGIONS.map((region) => [region, region.weight] as const))
  return createContact({ region, campus, noEmail })
}
function leaseArticle(): ArticleDef {
  return articleByNumber(
    weighted([
      ['A-10005', 60],
      ['A-10001', 10],
      ['A-10003', 10],
      ['A-10103', 10],
      ['A-10205', 10],
    ] as const),
  )
}

// ---- leases linked to service requests ----

function linkLease(l: LeaseDraft, d: SrDraft): void {
  const linkAt = Math.max(d.importedAt, l.importedAt) + 2000
  leaseChain(l, linkAt)
  lev(l, linkAt, 'link_service_request', 'replacement_ordered', 'import', null, null, {
    serviceRequestNumber: d.number,
  })
  l.linkedAt = linkAt
}
const openWithOldBase = srDrafts.filter(
  (d) =>
    d.sc.status !== 'completed' &&
    d.sc.status !== 'cancelled' &&
    d.items.some((it) => it.slot === 'old_base'),
)
const notCollected = must(
  srDrafts.find((d) => d.sc.key === 'dv10'),
  'DV10 SR',
)
const collectedSrs = srDrafts.filter(
  (d) =>
    d.sc.status === 'completed' &&
    d.items.some((it) => it.slot === 'old_base' && it.verifiedAt !== null),
)
for (const d of [...shuffle(openWithOldBase).slice(0, 11), notCollected]) {
  const it = must(
    d.items.find((entry) => entry.slot === 'old_base'),
    'old base item',
  )
  const asset = must(it.asset, 'old base asset')
  const l = createLease(
    'linked',
    'replacement_ordered',
    d.contact,
    asset,
    addDays(T, int(-5, 75)),
    latestLeaseImportBefore(d.importedAt),
    d,
  )
  linkLease(l, d)
}
for (const d of collectedSrs.slice(0, 2)) {
  const it = must(
    d.items.find((entry) => entry.slot === 'old_base'),
    'old base item',
  )
  const asset = must(it.asset, 'old base asset')
  const l = createLease(
    'collected',
    'closed',
    d.contact,
    asset,
    addDays(T, int(-30, 20)),
    latestLeaseImportBefore(d.importedAt),
    d,
  )
  linkLease(l, d)
  const closedAt = must(d.completedAt, 'completion') + 1000
  lev(l, closedAt, 'close', 'closed', 'system', d.finisher, null, {
    closeReason: 'device_collected',
  })
  l.closedAt = closedAt
  l.closeReason = 'device_collected'
  l.installStatus = 'In stock'
  l.lastSeenAt = Math.min(l.lastSeenAt, latestLeaseImportBefore(closedAt))
}

// ---- open lease returns without a replacement order ----

function openLease(
  key: string,
  target: LeaseReturnStatus,
  retirement: string,
  importedAt: number,
  contact = leaseOnlyContact(),
): LeaseDraft {
  const asset = oldDevice(leaseArticle(), contact)
  const l = createLease(key, target, contact, asset, retirement, importedAt)
  leaseChain(l, NOW)
  return l
}
// imported (8): two just reach the 42-day info window tomorrow; one contact without email
for (let i = 0; i < 8; i++) {
  const retirement = i < 2 ? addDays(T, 43) : i === 7 ? addDays(T, 20) : addDays(T, int(50, 120))
  openLease(
    'plain',
    'imported',
    retirement,
    pick(LEASE_IMPORTS.slice(1)),
    i === 7 ? leaseOnlyContact(false, true) : leaseOnlyContact(i === 3),
  )
}
// imported_vip (2): one VIP who also has a VIP service request, one lease-only VIP
openLease(
  'vip',
  'imported_vip',
  addDays(T, int(20, 60)),
  at0(LEASE_IMPORTS, 1),
  must(vipContacts.get(1), 'VIP 1'),
)
openLease(
  'vip',
  'imported_vip',
  addDays(T, int(20, 60)),
  at0(LEASE_IMPORTS, 2),
  vipContact(4, weighted(REGIONS.map((region) => [region, region.weight] as const)), false),
)
/** Retirement such that the chain step `depth` ran on `lastMailDay` (mail every 7 days). */
function chainRetirement(lastMailDay: string, depth: number): string {
  return addDays(lastMailDay, 42 - 7 * depth)
}
function chainImport(lastMailDay: string, depth: number): number {
  const infoDay = addDays(lastMailDay, -7 * depth)
  return (
    [...LEASE_IMPORTS].reverse().find((importAt) => zurichDay(importAt) < infoDay) ??
    at0(LEASE_IMPORTS, 0)
  )
}
const LEASE_CHAIN: readonly (readonly [LeaseReturnStatus, number, number])[] = [
  ['info_sent', 0, 6],
  ['reminder_1_sent', 1, 4],
  ['reminder_2_sent', 2, 3],
]
for (const [status, depth, count] of LEASE_CHAIN) {
  for (let i = 0; i < count; i++) {
    const lastMailDay = addDays(T, -int(1, 6))
    openLease(
      'plain',
      status,
      chainRetirement(lastMailDay, depth),
      chainImport(lastMailDay, depth),
      leaseOnlyContact(status === 'info_sent' && i === 0),
    )
  }
}
// escalated (3): one with an extra escalation recipient, one stale with the retirement passed
for (let i = 0; i < 3; i++) {
  const lastMailDay = i === 2 ? addDays(T, -int(40, 46)) : addDays(T, -int(1, 5))
  const l = openLease(
    i === 2 ? 'stale' : 'plain',
    'escalated',
    chainRetirement(lastMailDay, 3),
    chainImport(lastMailDay, 3),
  )
  if (i === 0) l.escalationEmail = `cc-${int(1000, 8999)}.manager@example.com`
}
// probably_closed (2): missing from the latest full lease import
for (let i = 0; i < 2; i++) {
  const contact = leaseOnlyContact()
  const l = createLease(
    'probably-closed',
    'probably_closed',
    contact,
    oldDevice(leaseArticle(), contact),
    addDays(T, int(5, 25)),
    at0(LEASE_IMPORTS, 1),
  )
  leaseChain(l, LATEST_LEASE_IMPORT)
  lev(
    l,
    LATEST_LEASE_IMPORT + 5000 + i * 1000,
    'mark_probably_closed',
    'probably_closed',
    'import',
    null,
  )
  l.lastSeenAt = l.importedAt
}

// ---- historic devices: collected without SR, deactivated (SPEC §11.4 "historic returns") ----

const STATUS_SYNC_AT = at(workdayOnOrBefore(addDays(T, -4)), 9, 10)
const BATCH_1_AT = at(workdayOnOrBefore(addDays(T, -20)), 10, 30)
const BATCH_2_AT = at(workdayOnOrBefore(addDays(T, -6)), 11, 15)
const DISPOSED_AT = at(workdayOnOrBefore(addDays(T, -15)), 14, 5)
/** Historic devices belonged to employees who are already contacts (earlier device generations). */
const formerHolders = shuffle(
  contacts.filter((contact) => !isVipContact(contact) && contact.row.email !== null),
)
let formerHolderCursor = 0
function formerHolder(): ContactDraft {
  return at0(formerHolders, formerHolderCursor++)
}
const historicCollected: AssetDraft[] = []
for (let i = 0; i < 6; i++) {
  const asset = oldDevice(leaseArticle(), formerHolder())
  move(
    asset,
    STATUS_SYNC_AT + i * 1000,
    'sync_collected',
    'collected',
    locationOf(at0(HUBS, i % 3), 'return'),
    'import',
  )
  historicCollected.push(asset)
}
const deactivated: AssetDraft[] = []
const DEACTIVATIONS: readonly (readonly [AssetStatus, number, string | null])[] = [
  ...Array.from(
    { length: 10 },
    () => ['deactivated_returned', BATCH_1_AT, 'deactivation:1'] as const,
  ),
  ...Array.from(
    { length: 2 },
    () => ['deactivated_bought_out', BATCH_2_AT, 'deactivation:2'] as const,
  ),
  ...Array.from({ length: 2 }, () => ['deactivated_disposed', DISPOSED_AT, null] as const),
]
DEACTIVATIONS.forEach(([status, time, sourceRef], index) => {
  const asset = oldDevice(leaseArticle(), formerHolder())
  if (index % 3 === 2) {
    const collectedAt = time - int(10, 30) * DAY_MS
    move(
      asset,
      collectedAt,
      'sync_collected',
      'collected',
      locationOf(at0(HUBS, index % 3), 'return'),
      'import',
    )
  }
  if (status === 'deactivated_disposed') {
    move(asset, time + index * 1000, 'correct', status, OFF_FLEET, 'user', {
      actor: DANA,
      reason: 'Disposed after water damage — lessor approval on file',
    })
  } else {
    move(asset, time + index * 1000, 'deactivate', status, OFF_FLEET, 'user', {
      actor: DANA,
      sourceRef,
    })
  }
  deactivated.push(asset)
})

// ---- closed lease returns: 2 deactivated by upload, 1 closed manually ----

for (const [asset, retirement, importedAt] of [
  [at0(deactivated, 0), addDays(T, -int(21, 25)), at0(LEASE_IMPORTS, 0)],
  [at0(deactivated, 10), addDays(T, -int(5, 10)), at0(LEASE_IMPORTS, 1)],
] as const) {
  const l = createLease(
    'deactivated',
    'closed',
    must(asset.owner, 'owner'),
    asset,
    retirement,
    importedAt,
  )
  const deactivatedAt = must(asset.moves.at(-1), 'deactivation').at
  leaseChain(l, deactivatedAt)
  lev(l, deactivatedAt + 1000, 'close', 'closed', 'system', DANA, null, {
    closeReason: 'device_deactivated',
  })
  l.closedAt = deactivatedAt + 1000
  l.closeReason = 'device_deactivated'
  l.installStatus = 'Retired'
  l.lastSeenAt = latestLeaseImportBefore(l.closedAt)
}
{
  const asset = at0(historicCollected, 0)
  const l = createLease(
    'manual-close',
    'closed',
    must(asset.owner, 'owner'),
    asset,
    addDays(T, int(10, 20)),
    at0(LEASE_IMPORTS, 1),
  )
  const closedAt = at(addWorkdays(zurichDay(STATUS_SYNC_AT), 1), 11, int(0, 59))
  leaseChain(l, closedAt)
  const comment = 'Device returned by courier and logged at the hub returns shelf.'
  lev(l, closedAt, 'close', 'closed', 'user', DANA, comment)
  l.closedAt = closedAt
  l.closeReason = comment
  l.installStatus = 'In stock'
}

for (const l of leases) {
  if (l.cur !== l.target)
    throw new Error(
      `Lease ${l.seq} (${l.key}) ended in ${l.cur ?? 'nothing'}, expected ${l.target}`,
    )
}
leases.sort((a, b) => a.importedAt - b.importedAt || a.seq - b.seq)
leases.forEach((l, index) => {
  l.id = index + 1
})

// ---- lease comments (Dana / Ada) ----

interface CommentDraft {
  lease: LeaseDraft
  body: string
  author: number
  at: number
}
const commentDrafts: CommentDraft[] = []
function leaseWhere(predicate: (l: LeaseDraft) => boolean, what: string): LeaseDraft {
  return must(leases.find(predicate), `lease ${what}`)
}
const COMMENTS: readonly (readonly [LeaseDraft, string])[] = [
  [
    leaseWhere((l) => l.target === 'escalated' && l.escalationEmail !== null, 'escalated + cc'),
    'Escalation contact informed; waiting for the cost-centre manager to reply.',
  ],
  [
    leaseWhere((l) => l.key === 'stale', 'stale'),
    'No reaction after the escalation. Asked Globex Fleet AG whether the lease can be extended.',
  ],
  [
    leaseWhere((l) => l.key === 'stale', 'stale'),
    'Lessor allows two more weeks; user will be called again on Monday.',
  ],
  [
    leaseWhere((l) => l.target === 'reminder_2_sent', 'reminder 2'),
    'User asked to keep the device until the replacement arrives.',
  ],
  [
    leaseWhere((l) => l.sr === notCollected, 'not collected'),
    'Old laptop stays with the user until the data migration is finished (DV10).',
  ],
  [
    leaseWhere((l) => l.sr === notCollected, 'not collected'),
    'Follow-up booked for next week to collect the old laptop.',
  ],
  [
    leaseWhere((l) => l.target === 'probably_closed', 'probably closed'),
    'Not in the latest lessor list — checking with Initech Logistics whether it was returned directly.',
  ],
  [
    leaseWhere((l) => l.key === 'manual-close', 'manual close'),
    'Courier pickup confirmed by the user; waiting for the returns log.',
  ],
  [
    leaseWhere((l) => l.target === 'info_sent', 'info sent'),
    'User is on leave until next week; will follow up after the return.',
  ],
  [
    leaseWhere((l) => l.target === 'imported_vip', 'VIP'),
    'VIP — coordinate the return through the executive office.',
  ],
]
COMMENTS.forEach(([lease, body], index) => {
  const previous = commentDrafts.filter((c) => c.lease === lease).at(-1)
  const last = must(lease.events.at(-1), 'lease event').at
  let time = (previous?.at ?? last) + int(2, 30) * HOUR + int(0, 59) * MINUTE
  if (lease.closedAt !== null)
    time = lease.closedAt - int(30, 90) * MINUTE - (previous ? 0 : DAY_MS)
  if (time > NOW) time = NOW - int(5, 25) * MINUTE - (previous ? 0 : 3 * HOUR)
  if (time <= lease.importedAt) time = lease.importedAt + HOUR
  commentDrafts.push({ lease, body, author: index % 2 === 0 ? DANA : ADA, at: time })
})

// ---- the last ITSM import (T−1) refreshed every open service request ----

const LAST_SR_IMPORT = at(pwd(-1), 6, 30)
for (const d of srDrafts) {
  const open = d.sc.status !== 'completed' && d.sc.status !== 'cancelled'
  if (open && d.lastImportedAt < LAST_SR_IMPORT) d.lastImportedAt = LAST_SR_IMPORT + d.id * 1000
}

// =================================================================================================
// Hub stock (SPEC §11.4: Riverton healthy, Hillford short on Laptop Performance 16, Eastgate short
// on Monitor 34 Ultrawide and Docking Station Thunderbolt), missing devices
// =================================================================================================

function demandOf(siteId: number, articleId: number): number {
  let count = 0
  for (const d of srDrafts) {
    if (d.supplyingSiteId !== siteId) continue
    const counts =
      DEMAND_STATUSES.includes(d.sc.status) ||
      (d.sc.status === 'reschedule_needed' && d.resumeStatus !== 'shipped')
    if (!counts) continue
    count += newItems(d).filter((it) => it.article?.id === articleId).length
  }
  return count
}
function stockOf(siteId: number, articleId: number, type: LocationType | null = null): number {
  return assets.filter(
    (asset) =>
      asset.article.id === articleId &&
      asset.location?.siteId === siteId &&
      (type === null ? STOCK_TYPES.includes(asset.location.type) : asset.location.type === type) &&
      (asset.status === 'available' || asset.status === 'assigned' || asset.status === 'prepared'),
  ).length
}

const MAIN_TYPES = [
  'Laptop Standard 14',
  'Laptop Performance 16',
  'Laptop Convertible 13',
  'Laptop Workstation 15',
  'Docking Station USB-C',
  'Docking Station Thunderbolt',
  'Monitor 24',
  'Monitor 27',
  'Monitor 34 Ultrawide',
  'Headset Wireless ANC',
] as const
const ALWAYS_STOCKED: readonly string[] = [
  'Laptop Standard 14',
  'Docking Station USB-C',
  'Monitor 27',
]
for (const hub of HUBS) {
  for (const type of MAIN_TYPES) {
    const article = typeArticle(type)
    const deficit = Math.max(0, demandOf(hub, article.id) - stockOf(hub, article.id))
    let count =
      deficit +
      (hub === RIV
        ? ALWAYS_STOCKED.includes(type)
          ? 2
          : deficit > 0
            ? 1
            : 0
        : ALWAYS_STOCKED.includes(type)
          ? 1
          : 0)
    if (hub === HIL && type === 'Laptop Performance 16')
      count = Math.max(0, 1 - stockOf(hub, article.id))
    if (hub === EAS && type === 'Monitor 34 Ultrawide') count = 0
    if (hub === EAS && type === 'Docking Station Thunderbolt')
      count = Math.max(0, 1 - stockOf(hub, article.id))
    for (let i = 0; i < count; i++) {
      receiveStock(article, hub, workdayOnOrBefore(addDays(T, -int(5, 60))), true)
    }
  }
}
const ACCESSORY_STOCK: readonly (readonly [number, string, number])[] = [
  [RIV, 'Headset Mono', 2],
  [RIV, 'Keyboard Wireless', 2],
  [RIV, 'Mouse Wireless', 2],
  [RIV, 'Webcam HD', 1],
  [RIV, 'Charger 65W', 2],
  [HIL, 'Keyboard and Mouse Set', 2],
  [HIL, 'Headset Stereo', 1],
  [EAS, 'Headset Stereo', 2],
  [EAS, 'Charger 65W', 1],
]
for (const [hub, type, count] of ACCESSORY_STOCK) {
  for (let i = 0; i < count; i++)
    receiveStock(typeArticle(type), hub, workdayOnOrBefore(addDays(T, -int(10, 60))), true)
}
// Goods in: this week's deliveries, not yet placed on an installation place.
const GOODS_IN: readonly (readonly [number, string, number])[] = [
  [RIV, 'Laptop Standard 14', 3],
  [RIV, 'Docking Station USB-C', 2],
  [HIL, 'Laptop Standard 14', 2],
  [HIL, 'Monitor 24', 1],
  [EAS, 'Laptop Standard 14', 2],
  [EAS, 'Monitor 27', 2],
]
for (const [hub, type, count] of GOODS_IN) {
  const day = pwd(-int(1, 4))
  for (let i = 0; i < count; i++) receiveStock(typeArticle(type), hub, day, false)
}
// Missing (3): not found at their installation place in Hillford staging.
const MISSING_AT = at(pwd(-8), 15, 20)
;['Laptop Standard 14', 'Laptop Standard 14', 'Monitor 24'].forEach((type, index) => {
  const asset = receiveStock(
    typeArticle(type),
    HIL,
    workdayOnOrBefore(addDays(T, -int(30, 45))),
    true,
  )
  move(
    asset,
    MISSING_AT + index * 1000,
    'mark_missing',
    'missing',
    locationOf(HIL, 'staging'),
    'user',
    {
      actor: DANA,
      reason: 'Not found at its installation place during the spot check',
    },
  )
})

// ---- ids: assets by creation, movements by time ----

assets.sort((a, b) => a.createdAt - b.createdAt || a.seq - b.seq)
assets.forEach((asset, index) => {
  asset.id = index + 1
})
const moveDrafts = assets.flatMap((asset) => asset.moves.map((m, index) => ({ asset, m, index })))
moveDrafts.sort((a, b) => a.m.at - b.m.at || a.asset.id - b.asset.id || a.index - b.index)

// =================================================================================================
// Rows
// =================================================================================================

const sitesRows: SiteRow[] = SITES.map((site, index) => ({
  id: site.id,
  code: site.code,
  name: site.name,
  kind: site.kind,
  parentSiteId: site.parentSiteId,
  street: site.street,
  zip: site.zip,
  city: site.city,
  country: 'Freeland',
  isActive: true,
  sortOrder: index + 1,
}))
const locationRows: StockLocationRow[] = LOCATIONS.map((location) => ({
  ...location,
  isActive: true,
  sortOrder: location.id,
}))
const regionRows: RegionRow[] = REGIONS.map((region) => ({
  id: region.id,
  code: region.code,
  name: region.name,
  supplyingSiteId: region.siteId,
  defaultDeliveryType: region.delivery,
  bookingDestinationId: `dest-${region.code}`,
  bookingServiceId: 'svc-hw-rollout',
  pickupPointName: region.pickup?.[0] ?? null,
  pickupPointStreet: region.pickup?.[1] ?? null,
  pickupPointZip: region.pickup?.[2] ?? null,
  pickupPointCity: region.pickup?.[3] ?? null,
  isActive: true,
  sortOrder: region.id,
}))
const CATALOG_CREATED = at(workdayOnOrBefore(addDays(T, -420)), 9, 0)
const articleRows: ArticleRow[] = ARTICLES.map((article) => ({
  id: article.id,
  number: article.number,
  category: article.category,
  name: article.name,
  modelNumber: article.modelNumber,
  manufacturer: must(MANUFACTURERS[article.prefix], `manufacturer ${article.prefix}`),
  externalPartNumber: `IL-${pad(440000 + article.id * 37, 6)}`,
  internalDescription: article.internalDescription,
  weightKg: article.weightKg,
  isActive: article.isActive,
  createdAt: iso(CATALOG_CREATED + article.id * 1000),
  updatedAt: iso(
    article.isActive
      ? CATALOG_CREATED + article.id * 1000
      : at(workdayOnOrBefore(addDays(T, -200)), 9, 30),
  ),
}))
const CALLOFF_DAY = workdayOnOrBefore(addDays(T, -7))
const settingsRows: ArticleSiteSettingRow[] = ARTICLES.flatMap((article) =>
  HUBS.map((hub) => {
    const laptop = article.isActive && article.category === 'laptop'
    const dock = article.isActive && article.category === 'docking_station'
    const buffer = !article.isActive
      ? 0
      : laptop
        ? hub === EAS
          ? 3
          : 4
        : dock || article.category === 'monitor'
          ? 2
          : article.category === 'headset'
            ? 1
            : 0
    const ordered =
      article.isActive && ['laptop', 'docking_station', 'monitor'].includes(article.category)
    const goodsIn = stockOf(hub, article.id, 'goods_in')
    const staging = stockOf(hub, article.id, 'staging')
    const goodsOut = stockOf(hub, article.id, 'goods_out')
    return {
      id: 0,
      articleId: article.id,
      siteId: hub,
      bufferQty: buffer,
      minQty: laptop ? 5 : dock ? 3 : null,
      maxQty: laptop ? 40 : dock ? 30 : null,
      stockQty: goodsIn + staging + goodsOut,
      stockGoodsIn: goodsIn,
      stockStaging: staging,
      stockGoodsOut: goodsOut,
      demandQty: article.isActive ? demandOf(hub, article.id) : 0,
      calculatedAt: iso(CALCULATED_AT),
      lastOrderDate: ordered ? CALLOFF_DAY : null,
      lastOrderedQty: ordered ? int(2, 8) : null,
    }
  }),
)
settingsRows.forEach((row, index) => {
  row.id = index + 1
})

const LOGINS: Record<number, number> = {
  [DANA]: at(P0, 7, 20),
  [THEO]: at(P0, 6, 55),
  [VIC]: at(pwd(-3), 14, 10),
  [ADA]: at(pwd(-1), 16, 30),
  [TARA]: at(pwd(-1), 7, 5),
  [OMAR]: at(pwd(-1), 7, 10),
  [JONAS]: at(pwd(-2), 7, 15),
}
const userRows: UserRow[] = USERS.map((user) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role,
  homeSiteId:
    user.homeSiteCode === null
      ? null
      : must(
          SITES.find((site) => site.code === user.homeSiteCode),
          `site ${user.homeSiteCode}`,
        ).id,
  isActive: true,
  isDemoPersona: true,
  personaOrder: user.id,
  lastLoginAt: isoOrNull(LOGINS[user.id] ?? null),
}))

// VIPs without any record yet (listed before their first import).
for (const index of [5, 6, 7]) {
  vipContact(index, weighted(REGIONS.map((region) => [region, region.weight] as const)), false)
}
const contactRows: ContactRow[] = contacts.map((contact) => contact.row)
const vipRows: VipEntryRow[] = VIP_DEFS.map((vip, index) => {
  const contact = must(vipContacts.get(index), `VIP contact ${index}`)
  return {
    id: index + 1,
    userId: contact.row.userId,
    firstName: contact.row.firstName,
    lastName: contact.row.lastName,
    vipType: vip.vipType,
    title: vip.title,
    note: vip.note,
    createdAt: iso(at(workdayOnOrBefore(addDays(T, -int(100, 300))), 10, int(0, 59))),
  }
})

const NOUNS: Record<string, string> = {
  laptop: 'laptop',
  desktop: 'desktop',
  tablet: 'tablet',
  docking_station: 'dock',
  monitor: 'monitor',
  headset: 'headset',
}
function nounOf(it: ItemDraft): string {
  return it.article ? (NOUNS[it.article.category] ?? 'accessory') : 'laptop'
}
const CATALOG_ITEMS: Record<ProcurementType, string> = {
  replacement: 'Workplace hardware replacement',
  new_hire: 'New hire workplace equipment',
  additional_device: 'Additional workplace device',
  removal: 'Workplace hardware removal',
}
const CLIENT_COMPONENTS: Record<string, string> = {
  'Laptop Standard 14': 'Standard laptop',
  'Laptop Performance 16': 'Performance laptop',
  'Laptop Convertible 13': 'Convertible laptop',
  'Laptop Workstation 15': 'Mobile workstation',
  'Laptop Ultra 15': 'Ultra laptop',
}
function srTexts(d: SrDraft): {
  shortDescription: string
  scope: string
  component: string | null
} {
  const deliver = newItems(d)
  const nouns = deliver.map(nounOf)
  const base = deliver.find((it) => it.slot === 'new_base')
  const scope =
    nouns.length === 0
      ? 'Collection of the old device'
      : nouns
          .map((noun, i) => (i === 0 ? noun.charAt(0).toUpperCase() + noun.slice(1) : noun))
          .join(', ')
  const extras = nouns.slice(1)
  const withExtras = extras.length > 0 ? ` with ${extras.join(' and ')}` : ''
  const shortDescription =
    d.procurement === 'replacement'
      ? `Replace ${nouns[0] ?? 'laptop'}${withExtras}`
      : d.procurement === 'new_hire'
        ? `Equipment for new colleague: ${nouns.join(', ')}`
        : d.procurement === 'additional_device'
          ? `Additional ${nouns.join(' and ')}`
          : 'Collect old laptop (no replacement)'
  return {
    shortDescription,
    scope,
    component: base?.requestedType ? (CLIENT_COMPONENTS[base.requestedType] ?? null) : null,
  }
}

const srRows: ServiceRequestRow[] = srDrafts.map((d) => {
  const texts = srTexts(d)
  const statusEvents = d.events.filter((e) => e.from !== e.to)
  const contact = d.contact.row
  return {
    id: d.id,
    number: d.number,
    taskNumber: d.taskNumber,
    itsmState: d.itsmState,
    assignmentGroup: d.assignmentGroup,
    openedAt: iso(d.openedAt),
    catalogItem: CATALOG_ITEMS[d.procurement],
    shortDescription: texts.shortDescription,
    contactId: contact.id,
    costCenter: d.contact.costCenter,
    procurementType: d.procurement,
    scopeOfDelivery: texts.scope,
    clientComponent: texts.component,
    requestedSoftware: d.requestedSoftware,
    addedSoftware: d.addedSoftware,
    installedSoftware: d.installedSoftware,
    note: d.note,
    onsiteContactPhone: d.onsitePhone,
    deliveryRoom: contact.room,
    deliveryBuilding: contact.building,
    deliveryStreet: contact.street,
    deliveryZip: contact.zip,
    deliveryCity: contact.city,
    deliveryCountry: 'Freeland',
    regionId: d.region?.id ?? null,
    regionRuleId: d.ruleId,
    regionOverridden: false,
    supplyingSiteId: d.supplyingSiteId,
    deliveryType: d.deliveryType,
    deliveryTypeOverride: null,
    isCampus: d.campus,
    isVip: d.vip,
    status: d.sc.status,
    statusChangedAt: iso(must(statusEvents.at(-1), 'status event').at),
    resumeStatus: d.resumeStatus,
    communicationDate: d.communicationDay,
    communicationPaused: d.paused,
    communicationPauseReason: d.pauseReason,
    communicationResumeDate: d.resumeDate,
    hardwareUnavailableNotifiedAt: isoOrNull(d.holdNotifiedAt),
    holdSource: d.sc.status === 'hardware_unavailable' ? d.holdSource : null,
    editorUserId: d.editorId,
    claimedAt: isoOrNull(d.claimedAt),
    withoutAssetPrep: d.withoutAssetPrep,
    osReinstall: d.osReinstall,
    appointmentStartAt: isoOrNull(d.appointment?.start ?? null),
    appointmentEndAt: isoOrNull(d.appointment?.end ?? null),
    appointmentCalendarId: d.appointment?.calendarId ?? null,
    appointmentCalendarName: d.appointment ? calendarName(d.appointment.calendarId) : null,
    deviationCodeId: d.deviationId,
    deviationComment: d.deviationComment,
    importedAt: iso(d.importedAt),
    lastImportedAt: iso(d.lastImportedAt),
    lastImportJobId: null,
    personalizedAt: isoOrNull(d.personalizedAt),
    orderClosedAt: isoOrNull(d.orderClosedAt),
    providedAt: isoOrNull(d.providedAt),
    shippedAt: isoOrNull(d.shippedAt),
    completedAt: isoOrNull(d.completedAt),
    cancelledAt: isoOrNull(d.cancelledAt),
    protocolFileId: null,
    version: 1,
  }
})

const itemRows: ServiceRequestItemRow[] = []
for (const d of srDrafts) {
  for (const it of d.items) {
    itemRows.push({
      id: itemRows.length + 1,
      serviceRequestId: d.id,
      slot: it.slot,
      requestedType: it.requestedType,
      articleId: it.article?.id ?? null,
      expectedAssetTag: it.oldArticle ? must(it.asset, 'old asset').tag : null,
      assetId: it.asset?.id ?? null,
      assignedAt: isoOrNull(it.assignedAt),
      assignedBy: it.assignedBy,
      packedAt: isoOrNull(it.packedAt),
      packedBy: it.packedBy,
      verifiedAt: isoOrNull(it.verifiedAt),
      verifiedBy: it.verifiedBy,
      verifiedSerial: it.verifiedAt === null ? null : must(it.asset, 'verified asset').serial,
    })
  }
}

const MODEL_CATEGORIES: Partial<Record<ArticleCategory, string>> = {
  laptop: 'Notebook',
  docking_station: 'Docking station',
  monitor: 'Monitor',
}
function ciName(asset: AssetDraft): string {
  const prefix: Partial<Record<ArticleCategory, string>> = {
    laptop: 'NB',
    desktop: 'DT',
    tablet: 'TB',
    docking_station: 'DK',
    monitor: 'MN',
    headset: 'HS',
    keyboard: 'KB',
    mouse: 'MS',
    webcam: 'WC',
    bag: 'BG',
  }
  return `${prefix[asset.article.category] ?? 'AC'}-${asset.tag}`
}
const leaseRows: LeaseReturnRow[] = leases.map((l) => {
  const statusEvents = l.events.filter((e) => e.from !== e.to)
  return {
    id: l.id,
    assetTag: l.asset.tag,
    serialNumber: l.asset.serial,
    modelCategory: MODEL_CATEGORIES[l.asset.article.category] ?? null,
    model: l.asset.article.name,
    checkedInAt: iso(l.asset.checkedInAt),
    retirementDate: l.retirement,
    userId: l.contact.row.userId,
    contactId: l.contact.row.id,
    installStatus: l.installStatus,
    ciName: ciName(l.asset),
    costCenter: l.contact.costCenter,
    isVip: l.vip,
    isCampus: l.contact.campus,
    status: must(l.cur, 'lease status'),
    statusChangedAt: iso(must(statusEvents.at(-1), 'lease status event').at),
    communicationDate: l.communicationDay,
    communicationPaused: false,
    communicationPauseReason: null,
    communicationResumeDate: null,
    infoSentAt: isoOrNull(l.infoSentAt),
    reminder1SentAt: isoOrNull(l.reminder1SentAt),
    reminder2SentAt: isoOrNull(l.reminder2SentAt),
    escalationSentAt: isoOrNull(l.escalationSentAt),
    escalationEmail: l.escalationEmail,
    serviceRequestId: l.sr?.id ?? null,
    linkedAt: isoOrNull(l.linkedAt),
    closedAt: isoOrNull(l.closedAt),
    closeReason: l.closeReason,
    importedAt: iso(l.importedAt),
    lastSeenAt: iso(l.lastSeenAt),
    lastImportJobId: null,
    version: 1,
  }
})
commentDrafts.sort((a, b) => a.at - b.at)
const commentRows: LeaseReturnCommentRow[] = commentDrafts.map((c, index) => ({
  id: index + 1,
  leaseReturnId: c.lease.id,
  body: c.body,
  authorUserId: c.author,
  createdAt: iso(c.at),
}))

const assetRows: AssetRow[] = assets.map((asset) => {
  const last = must(asset.moves.at(-1), 'asset movement')
  return {
    id: asset.id,
    serialNumber: asset.serial,
    assetTag: asset.tag,
    articleId: asset.article.id,
    model: asset.article.modelNumber,
    externalAssetId: `AST${pad(4_100_000 + asset.id, 7)}`,
    ciName: ciName(asset),
    orderNumber: asset.orderNumber,
    macAddress: asset.mac,
    status: must(asset.status, 'asset status'),
    locationId: must(asset.location, 'asset location').id,
    installationPlace: asset.place,
    serviceRequestId: asset.sr?.id ?? null,
    assignedContactId: asset.status === 'in_use' ? (asset.contact?.row.id ?? null) : null,
    checkedInAt: iso(asset.checkedInAt),
    source: 'seed',
    statusChangedAt: iso(last.at),
    version: 1,
    createdAt: iso(asset.createdAt),
  }
})
const movementRows: AssetMovementRow[] = moveDrafts.map(({ asset, m }, index) => ({
  id: index + 1,
  assetId: asset.id,
  action: m.action,
  fromStatus: m.fromStatus,
  toStatus: m.toStatus,
  fromLocationId: m.fromLocation?.id ?? null,
  toLocationId: m.toLocation.id,
  fromInstallationPlace: m.fromPlace,
  toInstallationPlace: m.toPlace,
  serviceRequestId: m.sr?.id ?? null,
  actorUserId: m.actor,
  trigger: m.trigger,
  reason: m.reason,
  sourceRef: m.sourceRef,
  occurredAt: iso(m.at),
}))

const transitionDrafts = [
  ...srDrafts.flatMap((d) =>
    d.events.map((e) => ({ type: 'service_request' as const, entityId: d.id, e })),
  ),
  ...leases.flatMap((l) =>
    l.events.map((e) => ({ type: 'lease_return' as const, entityId: l.id, e })),
  ),
]
transitionDrafts.sort(
  (a, b) => a.e.at - b.e.at || a.type.localeCompare(b.type) || a.entityId - b.entityId,
)
const transitionRows: StatusTransitionRow[] = transitionDrafts.map(
  ({ type, entityId, e }, index) => ({
    id: index + 1,
    entityType: type,
    entityId,
    action: e.action,
    fromStatus: e.from,
    toStatus: e.to,
    actorUserId: e.actor,
    trigger: e.trigger,
    comment: e.comment,
    payload: e.payload,
    occurredAt: iso(e.at),
  }),
)

const calendarRows: BookingCalendarRow[] = CALENDAR_ORDER.map((entry, index) => ({
  id: index + 1,
  externalId: `cal-${entry.code}`,
  name: `${entry.name} route`,
  regionId: regionByCode(entry.code).id,
  serviceIds: ['svc-hw-rollout'],
  calendarType: 'route',
  isEnabled: true,
  syncedAt: iso(CALCULATED_AT),
}))
const VIEWS_CREATED = at(pwd(-15), 10, 5)
const savedViewRows: SavedViewRow[] = [
  { name: 'Escalated – Eastgate supply', search: { status: ['escalated'], siteId: [EAS] } },
  { name: 'Booked this week – Riverton', search: { stage: ['booked'], regionId: [RIVERTON.id] } },
  { name: 'Needs attention', search: { needsAttention: true } },
].map((view, index) => ({
  id: index + 1,
  userId: DANA,
  route: '/service-requests',
  name: view.name,
  search: view.search,
  isShared: true,
  sortOrder: index + 1,
  createdAt: iso(VIEWS_CREATED + index * MINUTE),
}))

const config: AppConfig = {
  appName: 'Hangar',
  version: '0.1.0-demo',
  demoMode: true,
  businessTimeZone: 'Europe/Zurich',
  today: T,
  gateways: { booking: 'fake', carrier: 'fake', mailer: 'memory' },
  mailpitUrl: null,
  limits: {
    importMaxBytes: 20_971_520,
    importMaxRows: 50_000,
    deactivationMaxRows: 10_000,
    bulkMaxIds: 200,
    perPageMax: 200,
  },
}

const fixture: SeedFixture = {
  meta: {
    version: SEED_FIXTURE_VERSION,
    generatedAt: iso(GENERATED_AT),
    anchorDate: T,
    source: 'hand-made',
  },
  tables: {
    users: userRows,
    saved_views: savedViewRows,
    contacts: contactRows,
    vip_entries: vipRows,
    sites: sitesRows,
    regions: regionRows,
    region_rules: REGION_RULES,
    stock_locations: locationRows,
    articles: articleRows,
    article_site_settings: settingsRows,
    assets: assetRows,
    asset_movements: movementRows,
    service_requests: srRows,
    service_request_items: itemRows,
    lease_returns: leaseRows,
    lease_return_comments: commentRows,
    status_transitions: transitionRows,
    deviation_codes: DEVIATION_CODES.map((code) => ({ ...code })),
    booking_calendars: calendarRows,
  },
  enums: ENUM_CATALOG,
  config,
}

// =================================================================================================
// Consistency check (--check)
// =================================================================================================

function checkFixture(f: SeedFixture, json: string): string[] {
  const errors: string[] = []
  const fail = (message: string): void => {
    if (errors.length < 200) errors.push(message)
  }
  const t = f.tables
  const enumValues = (
    key: Exclude<keyof EnumsResponse, 'transitions' | 'permissions'>,
  ): Set<string> => new Set(f.enums[key].map((entry) => entry.value))

  // Unique ids and foreign keys.
  const ids = new Map<string, Set<number>>()
  for (const [table, rows] of Object.entries(t) as [string, { id: number }[]][]) {
    const set = new Set<number>()
    for (const row of rows) {
      if (set.has(row.id)) fail(`${table}: duplicate id ${row.id}`)
      set.add(row.id)
    }
    ids.set(table, set)
  }
  function fk<R extends { id: number }>(
    table: string,
    rows: readonly R[],
    field: keyof R,
    target: string,
    nullable = true,
  ): void {
    const targetIds = must(ids.get(target), target)
    for (const row of rows) {
      const value = row[field]
      if (value === null) {
        if (!nullable) fail(`${table}#${row.id}.${String(field)} is null`)
        continue
      }
      if (typeof value !== 'number' || !targetIds.has(value))
        fail(`${table}#${row.id}.${String(field)} → ${target} ${String(value)} missing`)
    }
  }
  fk('users', t.users, 'homeSiteId', 'sites')
  fk('saved_views', t.saved_views, 'userId', 'users', false)
  fk('sites', t.sites, 'parentSiteId', 'sites')
  fk('regions', t.regions, 'supplyingSiteId', 'sites', false)
  fk('region_rules', t.region_rules, 'regionId', 'regions', false)
  fk('stock_locations', t.stock_locations, 'siteId', 'sites')
  fk('article_site_settings', t.article_site_settings, 'articleId', 'articles', false)
  fk('article_site_settings', t.article_site_settings, 'siteId', 'sites', false)
  fk('assets', t.assets, 'articleId', 'articles')
  fk('assets', t.assets, 'locationId', 'stock_locations', false)
  fk('assets', t.assets, 'serviceRequestId', 'service_requests')
  fk('assets', t.assets, 'assignedContactId', 'contacts')
  fk('asset_movements', t.asset_movements, 'assetId', 'assets', false)
  fk('asset_movements', t.asset_movements, 'fromLocationId', 'stock_locations')
  fk('asset_movements', t.asset_movements, 'toLocationId', 'stock_locations', false)
  fk('asset_movements', t.asset_movements, 'serviceRequestId', 'service_requests')
  fk('asset_movements', t.asset_movements, 'actorUserId', 'users')
  fk('service_requests', t.service_requests, 'contactId', 'contacts', false)
  fk('service_requests', t.service_requests, 'regionId', 'regions')
  fk('service_requests', t.service_requests, 'regionRuleId', 'region_rules')
  fk('service_requests', t.service_requests, 'supplyingSiteId', 'sites')
  fk('service_requests', t.service_requests, 'editorUserId', 'users')
  fk('service_requests', t.service_requests, 'appointmentCalendarId', 'booking_calendars')
  fk('service_requests', t.service_requests, 'deviationCodeId', 'deviation_codes')
  fk(
    'service_request_items',
    t.service_request_items,
    'serviceRequestId',
    'service_requests',
    false,
  )
  fk('service_request_items', t.service_request_items, 'articleId', 'articles')
  fk('service_request_items', t.service_request_items, 'assetId', 'assets')
  fk('service_request_items', t.service_request_items, 'assignedBy', 'users')
  fk('service_request_items', t.service_request_items, 'packedBy', 'users')
  fk('service_request_items', t.service_request_items, 'verifiedBy', 'users')
  fk('lease_returns', t.lease_returns, 'contactId', 'contacts')
  fk('lease_returns', t.lease_returns, 'serviceRequestId', 'service_requests')
  fk('lease_return_comments', t.lease_return_comments, 'leaseReturnId', 'lease_returns', false)
  fk('lease_return_comments', t.lease_return_comments, 'authorUserId', 'users', false)
  fk('status_transitions', t.status_transitions, 'actorUserId', 'users')
  fk('booking_calendars', t.booking_calendars, 'regionId', 'regions')
  for (const row of t.status_transitions) {
    const target = row.entityType === 'service_request' ? 'service_requests' : 'lease_returns'
    if (!must(ids.get(target), target).has(row.entityId))
      fail(`status_transitions#${row.id}: ${target} ${row.entityId} missing`)
  }
  const contactsByUserId = new Map(t.contacts.map((c) => [c.userId, c]))
  for (const vip of t.vip_entries) {
    const contact = contactsByUserId.get(vip.userId)
    if (contact && contact.lastName !== vip.lastName)
      fail(`vip_entries#${vip.id}: name differs from contact`)
  }

  // Unique business keys and formats.
  const unique = (what: string, values: readonly (string | null)[]): void => {
    const seen = new Set<string>()
    for (const value of values) {
      if (value === null) continue
      if (seen.has(value)) fail(`duplicate ${what} ${value}`)
      seen.add(value)
    }
  }
  unique(
    'SR number',
    t.service_requests.map((r) => r.number),
  )
  unique(
    'task number',
    t.service_requests.map((r) => r.taskNumber),
  )
  unique(
    'serial',
    t.assets.map((r) => r.serialNumber),
  )
  unique(
    'asset tag',
    t.assets.map((r) => r.assetTag),
  )
  unique(
    'MAC',
    t.assets.map((r) => r.macAddress),
  )
  unique(
    'lease asset tag',
    t.lease_returns.map((r) => r.assetTag),
  )
  unique(
    'contact user id',
    t.contacts.map((r) => r.userId),
  )
  unique(
    'contact email',
    t.contacts.map((r) => r.email),
  )
  unique(
    'VIP user id',
    t.vip_entries.map((r) => r.userId),
  )
  unique(
    'article number',
    t.articles.map((r) => r.number),
  )
  unique(
    'location code',
    t.stock_locations.map((r) => r.code),
  )
  unique(
    'item slot',
    t.service_request_items.map((r) => `${r.serviceRequestId}/${r.slot}`),
  )
  unique(
    'installation place',
    t.assets
      .filter((a) => a.installationPlace !== null)
      .map((a) => `${a.locationId}/${a.installationPlace ?? ''}`),
  )
  for (const r of t.service_requests) {
    if (!/^SR\d{7}$/.test(r.number)) fail(`bad SR number ${r.number}`)
    if (r.taskNumber !== null && !/^TASK\d{7}$/.test(r.taskNumber))
      fail(`bad task number ${r.taskNumber}`)
  }
  for (const c of t.contacts) {
    if (!/^E1\d{5}$/.test(c.userId)) fail(`bad contact user id ${c.userId}`)
    for (const value of [c.phone, c.mobile])
      if (value !== null && !/^555-01\d{2}$/.test(value)) fail(`bad phone ${value}`)
  }
  for (const a of t.assets) {
    if (!/^(KD|LM|QA|AP|PW)[0-9A-HJKMNP-TV-Z]{8}$/.test(a.serialNumber))
      fail(`bad serial ${a.serialNumber}`)
    if (a.assetTag !== null && !/^GX[12]\d{5}$/.test(a.assetTag))
      fail(`bad asset tag ${a.assetTag}`)
    if (a.macAddress !== null && !/^02:00:5E(:[0-9A-F]{2}){3}$/.test(a.macAddress))
      fail(`bad MAC ${a.macAddress}`)
    if (
      a.installationPlace !== null &&
      !/^[A-Z]{1,2}[0-9]{1,2}-[0-9]{1,3}$/.test(a.installationPlace)
    )
      fail(`bad place ${a.installationPlace}`)
  }
  for (const match of json.matchAll(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g)) {
    if (!match[0].endsWith('@example.com')) fail(`non-example email ${match[0]}`)
  }
  for (const match of json.matchAll(/https?:\/\/[^\s"]+/g)) {
    if (!/^https?:\/\/([\w-]+\.)*example\.com/.test(match[0])) fail(`non-example URL ${match[0]}`)
  }

  // Enum values.
  const enumChecks: readonly [string, Set<string>, readonly (string | null)[]][] = [
    [
      'SR status',
      enumValues('serviceRequestStatus'),
      t.service_requests.flatMap((r) => [r.status, r.resumeStatus]),
    ],
    ['lease status', enumValues('leaseReturnStatus'), t.lease_returns.map((r) => r.status)],
    [
      'asset status',
      enumValues('assetStatus'),
      [
        ...t.assets.map((r) => r.status),
        ...t.asset_movements.flatMap((m) => [m.fromStatus, m.toStatus]),
      ],
    ],
    ['asset action', enumValues('assetAction'), t.asset_movements.map((m) => m.action)],
    ['location type', enumValues('locationType'), t.stock_locations.map((r) => r.type)],
    [
      'delivery type',
      enumValues('deliveryType'),
      [
        ...t.service_requests.flatMap((r) => [r.deliveryType, r.deliveryTypeOverride]),
        ...t.regions.map((r) => r.defaultDeliveryType),
        ...t.region_rules.map((r) => r.deliveryType),
      ],
    ],
    [
      'procurement type',
      enumValues('procurementType'),
      [
        ...t.service_requests.map((r) => r.procurementType),
        ...t.region_rules.map((r) => r.procurementType),
      ],
    ],
    ['item slot', enumValues('itemSlot'), t.service_request_items.map((r) => r.slot)],
    ['OS reinstall', enumValues('osReinstallTiming'), t.service_requests.map((r) => r.osReinstall)],
    ['gender', enumValues('gender'), t.contacts.map((r) => r.gender)],
    ['role', enumValues('role'), t.users.map((r) => r.role)],
    ['site kind', enumValues('siteKind'), t.sites.map((r) => r.kind)],
    ['match kind', enumValues('regionRuleMatchKind'), t.region_rules.map((r) => r.matchKind)],
    ['article category', enumValues('articleCategory'), t.articles.map((r) => r.category)],
    [
      'trigger',
      enumValues('trigger'),
      [...t.asset_movements.map((m) => m.trigger), ...t.status_transitions.map((r) => r.trigger)],
    ],
  ]
  for (const [what, allowed, values] of enumChecks) {
    for (const value of values)
      if (value !== null && !allowed.has(value)) fail(`unknown ${what} ${value}`)
  }

  // Status coverage.
  const coverage = (
    what: string,
    allowed: Set<string>,
    values: readonly string[],
    min: number,
  ): void => {
    for (const value of allowed) {
      const count = values.filter((v) => v === value).length
      if (count < min) fail(`${what} ${value}: ${count} rows (want ≥ ${min})`)
    }
  }
  coverage(
    'SR status',
    enumValues('serviceRequestStatus'),
    t.service_requests.map((r) => r.status),
    2,
  )
  coverage(
    'lease status',
    enumValues('leaseReturnStatus'),
    t.lease_returns.map((r) => r.status),
    2,
  )
  coverage(
    'asset status',
    enumValues('assetStatus'),
    t.assets.map((r) => r.status),
    1,
  )

  // Assets: SPEC §4.3 invariants and ledgers.
  const locations = new Map(t.stock_locations.map((l) => [l.id, l]))
  const srById = new Map(t.service_requests.map((r) => [r.id, r]))
  const movesByAsset = new Map<number, AssetMovementRow[]>()
  for (const m of t.asset_movements)
    movesByAsset.set(m.assetId, [...(movesByAsset.get(m.assetId) ?? []), m])
  for (const a of t.assets) {
    const location = must(locations.get(a.locationId), 'location')
    const where = `asset#${a.id} (${a.status} @ ${location.code})`
    if (['assigned', 'prepared', 'provided'].includes(a.status) && a.serviceRequestId === null)
      fail(`${where}: no SR`)
    if ((a.status === 'provided') !== (location.type === 'in_transit'))
      fail(`${where}: provided ⇔ in transit`)
    if ((a.status === 'in_use') !== (location.type === 'in_use')) fail(`${where}: in_use ⇔ IN_USE`)
    if (a.status.startsWith('deactivated_') !== (location.type === 'off_fleet'))
      fail(`${where}: deactivated ⇔ off fleet`)
    if (a.installationPlace !== null && location.type !== 'staging')
      fail(`${where}: place outside staging`)
    if (a.status === 'available' && !STOCK_TYPES.includes(location.type))
      fail(`${where}: available outside stock`)
    if (a.status === 'collected' && location.type !== 'return')
      fail(`${where}: collected outside returns`)
    if (a.status === 'assigned' && (location.type !== 'staging' || a.installationPlace === null))
      fail(`${where}: assigned without staging place`)
    if (a.status === 'prepared' && location.type !== 'goods_out')
      fail(`${where}: prepared outside goods out`)
    if ((a.status === 'in_use') !== (a.assignedContactId !== null))
      fail(`${where}: assigned contact ⇔ in use`)
    const sr = a.serviceRequestId === null ? null : srById.get(a.serviceRequestId)
    if (sr && ['assigned', 'prepared'].includes(a.status) && location.siteId !== sr.supplyingSiteId)
      fail(`${where}: not at the SR's supplying hub`)
    const moves = (movesByAsset.get(a.id) ?? []).sort(
      (x, y) => x.occurredAt.localeCompare(y.occurredAt) || x.id - y.id,
    )
    if (moves.length === 0) {
      fail(`${where}: no movements`)
      continue
    }
    if (at0(moves, 0).fromStatus !== null) fail(`${where}: first movement has a from status`)
    for (let i = 1; i < moves.length; i++) {
      const prev = at0(moves, i - 1)
      const next = at0(moves, i)
      if (
        next.fromStatus !== prev.toStatus ||
        next.fromLocationId !== prev.toLocationId ||
        next.fromInstallationPlace !== prev.toInstallationPlace
      ) {
        fail(`${where}: ledger break at movement ${next.id}`)
      }
    }
    const last = at0(moves, moves.length - 1)
    if (
      last.toStatus !== a.status ||
      last.toLocationId !== a.locationId ||
      last.toInstallationPlace !== a.installationPlace
    )
      fail(`${where}: ledger does not end in the current state`)
    if (last.occurredAt !== a.statusChangedAt) fail(`${where}: statusChangedAt ≠ last movement`)
  }

  // Service requests and items.
  const assetsById = new Map(t.assets.map((a) => [a.id, a]))
  const rulesById = new Map(t.region_rules.map((r) => [r.id, r]))
  const regionsById = new Map(t.regions.map((r) => [r.id, r]))
  const calendarsByRegion = new Map(t.booking_calendars.map((c) => [c.regionId, c]))
  const itemsBySr = new Map<number, ServiceRequestItemRow[]>()
  for (const it of t.service_request_items)
    itemsBySr.set(it.serviceRequestId, [...(itemsBySr.get(it.serviceRequestId) ?? []), it])
  const vipUserIds = new Set(t.vip_entries.map((v) => v.userId))
  const contactsById = new Map(t.contacts.map((c) => [c.id, c]))
  const expectedNewAsset: Partial<Record<Status, AssetStatus>> = {
    personalization_done: 'assigned',
    ready_for_picking: 'prepared',
    shipped: 'provided',
    provided: 'provided',
    completed: 'in_use',
  }
  for (const r of t.service_requests) {
    const where = `${r.number} (${r.status})`
    const appointment = [
      r.appointmentStartAt,
      r.appointmentEndAt,
      r.appointmentCalendarId,
      r.appointmentCalendarName,
    ]
    const holds = WITH_APPT.includes(r.status) || r.status === 'completed'
    if (holds && appointment.some((v) => v === null)) fail(`${where}: appointment missing`)
    if (!holds && appointment.some((v) => v !== null)) fail(`${where}: unexpected appointment`)
    if (
      r.appointmentCalendarId !== null &&
      r.regionId !== null &&
      calendarsByRegion.get(r.regionId)?.id !== r.appointmentCalendarId
    )
      fail(`${where}: calendar ≠ region calendar`)
    if (
      r.appointmentStartAt !== null &&
      r.appointmentEndAt !== null &&
      Date.parse(r.appointmentEndAt) - Date.parse(r.appointmentStartAt) !== HOUR
    )
      fail(`${where}: slot is not 60 min`)
    const effective = r.deliveryTypeOverride ?? r.deliveryType
    if (r.status === 'shipped' && (effective === null || effective === 'technician'))
      fail(`${where}: shipped without parcel delivery`)
    if (r.status === 'provided' && effective !== 'technician')
      fail(`${where}: provided without technician delivery`)
    if (r.isCampus && (r.regionId !== RIVERTON.id || effective !== 'technician'))
      fail(`${where}: campus must be Riverton/technician`)
    if (r.procurementType === 'removal' && effective !== 'technician')
      fail(`${where}: removal must be technician`)
    if (
      r.regionId === null &&
      (r.supplyingSiteId !== null || r.deliveryType !== null || r.regionRuleId !== null)
    )
      fail(`${where}: unresolved but has supply data`)
    if (r.regionId !== null) {
      const region = must(regionsById.get(r.regionId), 'region')
      if (r.supplyingSiteId !== region.supplyingSiteId)
        fail(`${where}: supplying site ≠ region hub`)
      const rule = r.regionRuleId === null ? null : rulesById.get(r.regionRuleId)
      if (rule?.regionId !== r.regionId) fail(`${where}: rule of another region`)
      if (rule && rule.isCampus !== r.isCampus) fail(`${where}: campus flag ≠ rule`)
    }
    if ((r.editorUserId !== null) !== (r.status === 'personalization_in_progress'))
      fail(`${where}: editor only while personalizing`)
    if ((r.resumeStatus !== null) !== (r.status === 'reschedule_needed'))
      fail(`${where}: resume status only while rescheduling`)
    if ((r.holdSource !== null) !== (r.status === 'hardware_unavailable'))
      fail(`${where}: hold source only on hold`)
    if (r.status === 'hardware_unavailable' && r.hardwareUnavailableNotifiedAt === null)
      fail(`${where}: hold not notified`)
    if (
      ['invited', 'campus_info_sent', 'reminder_1_sent', 'reminder_2_sent', 'escalated'].includes(
        r.status,
      ) &&
      r.communicationDate === null
    )
      fail(`${where}: no communication date`)
    const milestones: Partial<Record<Status, string | null>> = {
      ready_for_picking: r.orderClosedAt,
      shipped: r.shippedAt,
      provided: r.providedAt,
      completed: r.completedAt,
      cancelled: r.cancelledAt,
      personalization_in_progress: r.claimedAt,
      personalization_done: r.personalizedAt,
    }
    if (r.status in milestones && milestones[r.status] === null) fail(`${where}: milestone missing`)
    const contact = must(contactsById.get(r.contactId), 'contact')
    if (r.isVip !== vipUserIds.has(contact.userId)) fail(`${where}: isVip ≠ VIP list`)
    const items = itemsBySr.get(r.id) ?? []
    const newOnes = items.filter((it) => it.slot.startsWith('new_'))
    if (r.procurementType === 'removal' ? newOnes.length > 0 : newOnes.length === 0)
      fail(`${where}: wrong new items for ${r.procurementType ?? 'none'}`)
    const stage = r.status === 'reschedule_needed' ? r.resumeStatus : r.status
    for (const it of items) {
      const tag = `${where} ${it.slot}`
      if (it.slot.startsWith('new_')) {
        if (it.requestedType === null) fail(`${tag}: no requested type`)
        if (it.expectedAssetTag !== null) fail(`${tag}: new item with expected tag`)
        const asset = it.assetId === null ? null : assetsById.get(it.assetId)
        const expected = stage === null ? undefined : expectedNewAsset[stage]
        if (r.status === 'cancelled' && asset) fail(`${tag}: cancelled SR keeps a new asset`)
        if (expected !== undefined && !asset) fail(`${tag}: no asset (want ${expected})`)
        if (stage === 'appointment_booked' && asset) fail(`${tag}: asset before personalization`)
        if (asset) {
          if (asset.serviceRequestId !== r.id) fail(`${tag}: asset linked to another SR`)
          if (asset.articleId !== it.articleId) fail(`${tag}: asset article ≠ item article`)
          const want = r.status === 'personalization_in_progress' ? 'assigned' : expected
          if (want !== undefined && asset.status !== want)
            fail(`${tag}: asset ${asset.status}, want ${want}`)
          if (it.assignedAt === null || it.assignedBy === null)
            fail(`${tag}: asset without assignment`)
          if (it.verifiedAt !== null && it.verifiedSerial !== asset.serialNumber)
            fail(`${tag}: verified serial ≠ asset`)
        }
        if (r.status === 'shipped' && it.packedAt === null) fail(`${tag}: shipped but not packed`)
      } else {
        if (it.expectedAssetTag === null && it.assetId === null)
          fail(`${tag}: old item without tag`)
        const asset = it.assetId === null ? null : assetsById.get(it.assetId)
        if (asset && asset.assetTag !== it.expectedAssetTag)
          fail(`${tag}: asset tag ≠ expected tag`)
        if (asset && r.status !== 'completed' && asset.status !== 'in_use')
          fail(`${tag}: old device ${asset.status} on an open SR`)
        if (
          asset &&
          r.status === 'completed' &&
          it.verifiedAt !== null &&
          asset.status !== 'collected'
        )
          fail(`${tag}: verified old device not collected`)
      }
    }
  }

  // Lease returns.
  const assetsByTag = new Map(t.assets.map((a) => [a.assetTag, a]))
  for (const l of t.lease_returns) {
    const where = `lease#${l.id} ${l.assetTag} (${l.status})`
    const asset = assetsByTag.get(l.assetTag)
    if (!asset) fail(`${where}: no asset with this tag`)
    else if (asset.serialNumber !== l.serialNumber) fail(`${where}: serial ≠ asset`)
    if (
      l.status === 'replacement_ordered' ||
      (l.status === 'closed' && l.serviceRequestId !== null)
    ) {
      const items = l.serviceRequestId === null ? [] : (itemsBySr.get(l.serviceRequestId) ?? [])
      if (!items.some((it) => it.slot.startsWith('old_') && it.expectedAssetTag === l.assetTag))
        fail(`${where}: linked SR does not name this tag`)
      if (l.linkedAt === null) fail(`${where}: no linkedAt`)
    }
    if ((l.status === 'closed') !== (l.closedAt !== null && l.closeReason !== null))
      fail(`${where}: closedAt/closeReason ⇔ closed`)
    const stamps: Partial<Record<LeaseReturnStatus, string | null>> = {
      info_sent: l.infoSentAt,
      reminder_1_sent: l.reminder1SentAt,
      reminder_2_sent: l.reminder2SentAt,
      escalated: l.escalationSentAt,
    }
    if (l.status in stamps && stamps[l.status] === null) fail(`${where}: mail timestamp missing`)
    const contact = l.contactId === null ? null : contactsById.get(l.contactId)
    if (contact?.userId !== l.userId) fail(`${where}: user id ≠ contact`)
    if (l.isVip !== vipUserIds.has(l.userId)) fail(`${where}: isVip ≠ VIP list`)
  }

  // Status histories.
  const history = new Map<string, StatusTransitionRow[]>()
  for (const row of t.status_transitions) {
    const key = `${row.entityType}:${row.entityId}`
    history.set(key, [...(history.get(key) ?? []), row])
  }
  const current = [
    ...t.service_requests.map(
      (r) => [`service_request:${r.id}`, r.status, r.statusChangedAt] as const,
    ),
    ...t.lease_returns.map((r) => [`lease_return:${r.id}`, r.status, r.statusChangedAt] as const),
  ]
  for (const [key, status, changedAt] of current) {
    const rows = (history.get(key) ?? []).sort(
      (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id - b.id,
    )
    const first = rows[0]
    if (first?.action !== 'import_create' || first.fromStatus !== null)
      fail(`${key}: history does not start with import_create`)
    for (let i = 1; i < rows.length; i++) {
      if (at0(rows, i).fromStatus !== at0(rows, i - 1).toStatus)
        fail(`${key}: history break at ${at0(rows, i).id}`)
    }
    if (rows.at(-1)?.toStatus !== status)
      fail(`${key}: history ends in ${rows.at(-1)?.toStatus ?? 'nothing'}, row is ${status}`)
    const lastChange = rows.filter((row) => row.fromStatus !== row.toStatus).at(-1)
    if (lastChange?.occurredAt !== changedAt) fail(`${key}: statusChangedAt ≠ last status change`)
  }
  // Every transition follows the catalog's state machine (SPEC §4.1.1 / §4.2).
  const machines = {
    service_request: f.enums.transitions.serviceRequest,
    lease_return: f.enums.transitions.leaseReturn,
  }
  for (const row of t.status_transitions) {
    if (row.action === 'import_create') continue
    const def = machines[row.entityType].find((entry) => entry.action === row.action)
    const where = `transition#${row.id} ${row.entityType} ${row.action}`
    if (!def) {
      fail(`${where}: unknown action`)
      continue
    }
    if (row.fromStatus === null || !def.from.includes(row.fromStatus))
      fail(`${where}: from ${row.fromStatus ?? '∅'} not allowed`)
    if (def.to !== null && def.to !== row.toStatus)
      fail(`${where}: to ${row.toStatus}, catalog says ${def.to}`)
    if (!def.triggers.includes(row.trigger)) fail(`${where}: trigger ${row.trigger} not allowed`)
    if (row.trigger === 'user' && row.actorUserId === null)
      fail(`${where}: user action without actor`)
    if (['job', 'sync', 'import'].includes(row.trigger) && row.actorUserId !== null)
      fail(`${where}: ${row.trigger} with actor`)
    if (def.requiresComment && row.trigger === 'user' && !row.comment)
      fail(`${where}: comment required`)
  }

  // Timestamps: canonical UTC seconds, nothing after the seed clock.
  for (const match of json.matchAll(/"(\d{4}-\d{2}-\d{2}T[^"]*)"/g)) {
    const value = match[1] ?? ''
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) fail(`timestamp format ${value}`)
  }
  const seedClock = Date.parse(f.meta.generatedAt)
  for (const row of t.status_transitions)
    if (Date.parse(row.occurredAt) > seedClock) fail(`transition#${row.id} after the seed clock`)
  for (const row of t.asset_movements)
    if (Date.parse(row.occurredAt) > seedClock) fail(`movement#${row.id} after the seed clock`)
  for (const row of t.lease_return_comments)
    if (Date.parse(row.createdAt) > seedClock) fail(`comment#${row.id} after the seed clock`)

  // Stock math (SPEC §6.7).
  for (const s of t.article_site_settings) {
    let goodsIn = 0
    let staging = 0
    let goodsOut = 0
    for (const a of t.assets) {
      const location = must(locations.get(a.locationId), 'location')
      if (a.articleId !== s.articleId || location.siteId !== s.siteId) continue
      if (!['available', 'assigned', 'prepared'].includes(a.status)) continue
      if (location.type === 'goods_in') goodsIn++
      if (location.type === 'staging') staging++
      if (location.type === 'goods_out') goodsOut++
    }
    let demand = 0
    for (const r of t.service_requests) {
      if (r.supplyingSiteId !== s.siteId) continue
      if (!(
        DEMAND_STATUSES.includes(r.status) ||
        (r.status === 'reschedule_needed' && r.resumeStatus !== 'shipped')
      ))
        continue
      demand += (itemsBySr.get(r.id) ?? []).filter(
        (it) => it.slot.startsWith('new_') && it.articleId === s.articleId,
      ).length
    }
    if (
      s.stockGoodsIn !== goodsIn ||
      s.stockStaging !== staging ||
      s.stockGoodsOut !== goodsOut ||
      s.stockQty !== goodsIn + staging + goodsOut
    )
      fail(`settings#${s.id}: stock mismatch`)
    if (s.demandQty !== demand) fail(`settings#${s.id}: demand ${s.demandQty} ≠ ${demand}`)
  }
  const cell = (site: number, type: string): ArticleSiteSettingRow =>
    must(
      t.article_site_settings.find(
        (s) => s.siteId === site && s.articleId === typeArticle(type).id,
      ),
      type,
    )
  const hilLp = cell(HIL, 'Laptop Performance 16')
  if (hilLp.demandQty <= hilLp.stockQty)
    fail(`story: Hillford Laptop Performance 16 not short (${hilLp.demandQty}/${hilLp.stockQty})`)
  const easUw = cell(EAS, 'Monitor 34 Ultrawide')
  if (easUw.stockQty !== 0 || easUw.demandQty === 0)
    fail(`story: Eastgate Monitor 34 Ultrawide (${easUw.demandQty}/${easUw.stockQty})`)
  const easTb = cell(EAS, 'Docking Station Thunderbolt')
  if (easTb.demandQty <= easTb.stockQty)
    fail(`story: Eastgate Thunderbolt dock not short (${easTb.demandQty}/${easTb.stockQty})`)

  // Theo's tour today: 5 provided Riverton stops at 08:00, 09:30, 11:00, 13:00, 14:30.
  const theoStarts = THEO_TODAY.map(([hour, minute]) => iso(at(D0, hour, minute)))
  const theoStops = t.service_requests.filter(
    (r) =>
      r.appointmentCalendarId === RIVERTON.calendarId &&
      r.appointmentStartAt !== null &&
      zurichDay(Date.parse(r.appointmentStartAt)) === D0,
  )
  const startsOk = theoStarts.every((start) =>
    theoStops.some((r) => r.appointmentStartAt === start),
  )
  if (
    theoStops.length !== 5 ||
    !startsOk ||
    theoStops.some((r) => r.status !== 'provided' || r.regionId !== RIVERTON.id)
  ) {
    fail(
      `Theo's tour today: ${theoStops.length} stops (${theoStops.map((r) => `${r.status}@${r.appointmentStartAt ?? ''}`).join(', ')})`,
    )
  }
  if (json.length > 1_500_000) fail(`seed.json is ${json.length} bytes (> 1.5 MB)`)
  return errors
}

// =================================================================================================
// Write + summary
// =================================================================================================

const json = `${JSON.stringify(fixture)}\n`
if (CHECK) {
  const errors = checkFixture(fixture, json)
  if (errors.length > 0) {
    console.error(`Seed check failed (${errors.length} problems):`)
    for (const error of errors) console.error(`  - ${error}`)
    process.exit(1)
  }
}
writeFileSync(OUTPUT, json)

const countBy = (values: readonly string[]): string =>
  [...new Set(values)]
    .map((value) => `${value} ${values.filter((v) => v === value).length}`)
    .join(', ')
console.info(`seed.json written: ${OUTPUT}`)
console.info(
  `  anchor ${T} (D0 ${D0}), ${(Buffer.byteLength(json) / 1024).toFixed(0)} KiB${CHECK ? ', check passed' : ''}`,
)
for (const [table, rows] of Object.entries(fixture.tables) as [string, unknown[]][]) {
  console.info(`  ${table.padEnd(22)} ${rows.length}`)
}
console.info(`  SR statuses:    ${countBy(srRows.map((r) => r.status))}`)
console.info(`  lease statuses: ${countBy(leaseRows.map((r) => r.status))}`)
console.info(`  asset statuses: ${countBy(assetRows.map((r) => r.status))}`)
