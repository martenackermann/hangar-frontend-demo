import type { ImportType } from '@/lib/api/types'
import { addDays, businessToday } from '@/lib/format'
import { db } from '@/mocks/db'
import { csv } from '@/mocks/files'
import { SPECS } from './formats'

/**
 * Demo sample exports (SPEC §7.9) built from the demo database: same headers and quirks as the
 * backend's `samples/*.csv` (packed cells, one Campus row, the hold group, existing lease tags,
 * an unmapped install state). `seed` makes the files deterministic; "Generate fresh ITSM
 * export" passes a random seed.
 */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

const BASE32 = '0123456789BCDFGHJKLMNPQRSTVWXYZ'
const STREETS = [
  'Harbour Road',
  'Elm Street',
  'Mill Lane',
  'Station Road',
  'High Street',
  'Ridge Avenue',
]
const LAPTOPS = ['Laptop Standard 14', 'Laptop Performance 16', 'Laptop Convertible 13']
const DOCKS = ['Docking Station USB-C', 'Docking Station Thunderbolt']
const HOLD_GROUP = 'Rollout Hardware Hold'

const pick = <T>(rnd: () => number, list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!
const serial = (rnd: () => number, prefix: string) =>
  prefix + Array.from({ length: 8 }, () => pick(rnd, BASE32.split(''))).join('')
const packed = (pairs: [string, string][]) => pairs.map(([k, v]) => `[${k}: ${v}]`).join(',')

function table(type: ImportType, rows: Record<string, string>[]): string {
  const columns = SPECS[type].columns.map((c) => c.name)
  return csv([columns, ...rows.map((row) => columns.map((c) => row[c] ?? ''))]).replace(
    /^\uFEFF/,
    '',
  )
}

function contacts(rnd: () => number, count: number) {
  const all = db.collection('contacts').filter((c) => c.email !== null)
  return Array.from({ length: count }, () => pick(rnd, all))
}

function regionAddress(rnd: () => number) {
  const region = pick(rnd, db.collection('regions').all())
  const prefix = db
    .collection('region_rules')
    .find((r) => r.regionId === region.id && r.matchKind === 'zip_prefix')
  return {
    street: `${1 + Math.floor(rnd() * 120)} ${pick(rnd, STREETS)}`,
    zip: `${prefix?.pattern ?? '10'}${100 + Math.floor(rnd() * 900)}`.slice(0, 5),
    city: region.name,
  }
}

function highestSrNumber(): number {
  return db
    .collection('service_requests')
    .all()
    .reduce((max, sr) => Math.max(max, Number(sr.number.slice(2))), 12_300)
}

function serviceRequests(rnd: () => number, count: number, withErrors: boolean): string {
  const start = highestSrNumber() + 1
  const people = contacts(rnd, count)
  const openLeases = db
    .collection('lease_returns')
    .filter((l) => ['imported', 'info_sent', 'reminder_1_sent'].includes(l.status) && !l.isVip)
  const rows = people.map((person, i) => {
    const address = regionAddress(rnd)
    const lease = !withErrors && i < 3 ? openLeases[i] : undefined
    const details: [string, string][] = [
      ['Procurement type', 'Replacement'],
      ['Scope of delivery', 'Laptop, dock, monitor'],
      ['Client component', 'Standard laptop'],
      [
        'Old base device',
        lease?.assetTag ?? `GX1${String(Math.floor(rnd() * 99_999)).padStart(5, '0')}`,
      ],
      ['New base device type', pick(rnd, LAPTOPS)],
      ['New peripheral 1 type', pick(rnd, DOCKS)],
      ['On-site contact phone', `+00 555 ${1000 + Math.floor(rnd() * 9000)}`],
    ]
    const contact = lease?.contactId ? db.collection('contacts').get(lease.contactId) : person
    const campus = !withErrors && i === 5
    return {
      sr_number: `SR${String(start + i).padStart(7, '0')}`,
      task_number: `TASK${String(45_000 + start + i).padStart(7, '0')}`,
      itsm_state: 'Open',
      assignment_group: !withErrors && (i === 3 || i === 4) ? HOLD_GROUP : 'Workplace Rollout',
      opened_at: `${addDays(businessToday(), -1)}T08:${String(10 + i).padStart(2, '0')}:00Z`,
      user_id: contact?.userId ?? person.userId,
      catalog_item: 'Workplace hardware replacement',
      short_description:
        `Replacement for ${contact?.firstName ?? ''} ${contact?.lastName ?? ''}`.trim(),
      order_details: packed(details),
      delivery_address: packed([
        [
          'Room',
          `${1 + Math.floor(rnd() * 5)}.${String(1 + Math.floor(rnd() * 40)).padStart(2, '0')}`,
        ],
        ['Building', `B${1 + Math.floor(rnd() * 6)}`],
        ['Street', campus ? '1 Campus Way' : address.street],
        ['Zip', campus ? '10500' : address.zip],
        ['City', campus ? 'Riverton' : address.city],
        ['Country', 'Freeland'],
      ]),
      gender: contact?.gender ?? 'unspecified',
      first_name: contact?.firstName ?? '',
      last_name: contact?.lastName ?? '',
      email: contact?.email ?? '',
      cost_center: `CC-${1000 + Math.floor(rnd() * 8000)}`,
    }
  })
  if (withErrors && rows.length >= 6) {
    rows[0] = {
      ...rows[0]!,
      user_id: 'E109001',
      first_name: 'Robin',
      last_name: 'Newcomer',
      email: '',
    }
    rows[1] = { ...rows[1]!, sr_number: 'SR12AB', task_number: '' }
    rows[2] = {
      ...rows[2]!,
      delivery_address: rows[2]!.delivery_address.replace(/\[Zip: [^\]]*\],/, ''),
    }
    rows[3] = {
      ...rows[3]!,
      order_details: `${rows[3]!.order_details},[Procurement type: Replacement]`,
    }
    rows[4] = {
      ...rows[4]!,
      order_details: rows[4]!.order_details.replace(
        /\[New base device type: [^\]]*\]/,
        '[New base device type: Laptop Ultra 15]',
      ),
    }
    rows[5] = { ...rows[5]!, order_details: `${rows[5]!.order_details},[Color: Blue]` }
    rows.push({ ...rows[0], user_id: rows[0].user_id })
  }
  return table('service_requests', rows)
}

function leaseReturns(rnd: () => number, count: number, withErrors: boolean): string {
  const today = businessToday()
  const rows = contacts(rnd, count).map((person, i) => ({
    asset_tag: `GX${150_001 + i}`,
    serial_number: serial(rnd, 'KD'),
    model_category: 'Notebook',
    checked_in_date: addDays(today, -900 - Math.floor(rnd() * 400)),
    retirement_date: addDays(today, 10 + Math.floor(rnd() * 80)),
    model: 'Aero 14 G2 Laptop',
    user_id: person.userId,
    install_status: 'In use',
    ci_name: `NB-${10_000 + Math.floor(rnd() * 89_999)}`,
    gender: person.gender,
    first_name: person.firstName ?? '',
    last_name: person.lastName,
    email: person.email ?? '',
    cost_center: `CC-${1000 + Math.floor(rnd() * 8000)}`,
    escalation_email: '',
  }))
  for (const lease of db
    .collection('lease_returns')
    .filter((l) => ['imported', 'info_sent'].includes(l.status))
    .slice(0, 2)) {
    const contact = lease.contactId ? db.collection('contacts').get(lease.contactId) : undefined
    rows.push({
      asset_tag: lease.assetTag,
      serial_number: lease.serialNumber ?? '',
      model_category: lease.modelCategory ?? 'Notebook',
      checked_in_date: lease.checkedInAt?.slice(0, 10) ?? '',
      retirement_date: lease.retirementDate,
      model: lease.model ?? '',
      user_id: lease.userId,
      install_status: 'In use',
      ci_name: 'NB-70100',
      gender: contact?.gender ?? 'unspecified',
      first_name: contact?.firstName ?? '',
      last_name: contact?.lastName ?? lease.userId,
      email: contact?.email ?? '',
      cost_center: lease.costCenter ?? '',
      escalation_email: '',
    })
  }
  if (withErrors && rows[0]) rows[0].retirement_date = '31/12/2026'
  return table('lease_returns', rows)
}

function contactsFile(rnd: () => number, count: number, withErrors: boolean): string {
  const rows = Array.from({ length: count }, (_, i) => {
    const address = regionAddress(rnd)
    const id = `E${100_501 + i}`
    return {
      user_id: id,
      gender: pick(rnd, ['female', 'male', 'diverse', 'unspecified']),
      first_name: pick(rnd, ['Mia', 'Noah', 'Lena', 'Ravi', 'Sofia', 'Jonah', 'Amara', 'Felix']),
      last_name: pick(rnd, ['Turner', 'Hale', 'Brooks', 'Lindgren', 'Okafor', 'Castell', 'Moreau']),
      email: `user.${id.toLowerCase()}@example.com`,
      phone: `+00 555 ${1000 + Math.floor(rnd() * 9000)}`,
      department: pick(rnd, ['Finance', 'Logistics', 'Sales', 'Engineering']),
      street: address.street,
      zip: address.zip,
      city: address.city,
      building: `B${1 + Math.floor(rnd() * 6)}`,
      room: `${1 + Math.floor(rnd() * 5)}.${String(1 + Math.floor(rnd() * 40)).padStart(2, '0')}`,
    }
  })
  if (withErrors && rows[0]) rows[0].last_name = ''
  return table('contacts', rows)
}

function assetsNew(rnd: () => number, count: number, withErrors: boolean): string {
  const articles = db.collection('articles').filter((a) => a.isActive)
  const today = businessToday()
  const rows = Array.from({ length: count }, (_, i) => {
    const article = pick(rnd, articles)
    return {
      order_number: `PO-${today.slice(2, 4)}${today.slice(5, 7)}-${100 + Math.floor(rnd() * 900)}`,
      serial_number: serial(rnd, article.modelNumber.split('-')[0] ?? 'KD'),
      asset_tag: `GX${260_001 + i}`,
      external_asset_id: `AST${100_000 + Math.floor(rnd() * 899_999)}`,
      ci_name: '',
      model: article.modelNumber,
      mac_address: ['laptop', 'docking_station'].includes(article.category)
        ? `02:00:5E:${[0, 0, 0]
            .map(() =>
              Math.floor(rnd() * 256)
                .toString(16)
                .padStart(2, '0')
                .toUpperCase(),
            )
            .join(':')}`
        : '',
      checked_in_date: addDays(today, -Math.floor(rnd() * 5)),
    }
  })
  if (rows.length > 3) {
    rows[1]!.model = 'KD-AERO15-X9'
    if (withErrors) rows[2]!.mac_address = 'XYZ'
  }
  return table('assets_new', rows)
}

function statusSync(rnd: () => number, count: number): string {
  const inUse = db
    .collection('assets')
    .filter((a) => a.status === 'in_use' && (a.assetTag ?? '').startsWith('GX1'))
    .slice(0, 4)
  const today = businessToday()
  const rows = Array.from({ length: count }, (_, i) => {
    const existing = inUse[i]
    const state = existing ? 'In use' : pick(rnd, ['In use', 'In transit', 'In stock'])
    return {
      serial_number: existing?.serialNumber ?? serial(rnd, 'KD'),
      install_state: state,
      stockroom: state === 'In stock' ? 'Old device stockroom' : '',
      sr_number: '',
      assigned_user_id:
        state === 'In use'
          ? (db.collection('contacts').get(existing?.assignedContactId ?? 1)?.userId ?? 'E100001')
          : '',
      asset_tag: existing?.assetTag ?? `GX${170_001 + i}`,
      model: existing?.model ?? 'KD-AERO14-G2',
      checked_in_date: addDays(today, -400 - Math.floor(rnd() * 500)),
    }
  })
  const last = rows[rows.length - 1]
  if (last) last.install_state = 'Retired'
  return table('asset_status_sync', rows)
}

export const SAMPLE_ROWS: Record<ImportType, number> = {
  lease_returns: 40,
  service_requests: 30,
  contacts: 30,
  assets_new: 60,
  asset_status_sync: 20,
}

export function buildSample(
  type: ImportType,
  {
    rows = SAMPLE_ROWS[type],
    seed = 7,
    withErrors = false,
  }: { rows?: number; seed?: number; withErrors?: boolean } = {},
): string {
  const rnd = prng(seed)
  switch (type) {
    case 'service_requests':
      return serviceRequests(rnd, rows, withErrors)
    case 'lease_returns':
      return leaseReturns(rnd, rows, withErrors)
    case 'contacts':
      return contactsFile(rnd, rows, withErrors)
    case 'assets_new':
      return assetsNew(rnd, rows, withErrors)
    case 'asset_status_sync':
      return statusSync(rnd, rows)
  }
}
