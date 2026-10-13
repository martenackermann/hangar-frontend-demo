import type { ImportOptions, ImportTemplate, ImportType } from '@/lib/api/types'

/**
 * The five import formats (SPEC §7.3–§7.7), a port of the backend's
 * `app/modules/h2_imports/importing/formats.py`. Served by `GET /imports/templates` and used by
 * the mock import engine.
 */
export type Kind =
  | 'text'
  | 'key'
  | 'date'
  | 'datetime'
  | 'date_or_datetime'
  | 'email'
  | 'optional_email'
  | 'gender'
  | 'itsm_state'
  | 'procurement'
  | 'zip'
  | 'mac'
  | 'phone'
  | 'software'
  | 'packed'

export interface ColumnSpec {
  name: string
  required?: boolean
  kind?: Kind
  maxLen?: number
  pattern?: RegExp
  format: string
  description: string
  example?: string | null
}

export interface PackedKeySpec {
  key: string
  name: string
  required?: boolean
  requiredUnlessRemoval?: boolean
  kind?: Kind
  maxLen?: number
  pattern?: RegExp
  description: string
}

export interface TypeSpec {
  type: ImportType
  label: string
  description: string
  signature: string[]
  key: string
  columns: ColumnSpec[]
  packed: Record<string, PackedKeySpec[]>
  options: { name: keyof ImportOptions; required: boolean; description: string }[]
}

const ASSET_TAG = /^[A-Z0-9-]{4,20}$/
const SERIAL = /^[A-Z0-9-]{4,40}$/
const USER_ID = /^[A-Z0-9]{3,16}$/
const COST_CENTER = /^[A-Z0-9-]{2,20}$/
const SR_NUMBER = /^SR[0-9]{7}$/
const TASK_NUMBER = /^TASK[0-9]{7}$/

export const ITSM_STATES = [
  'New',
  'Open',
  'Work in Progress',
  'On Hold',
  'Closed Complete',
  'Cancelled',
] as const
export const OLD_DEVICE_STOCKROOM = 'Old device stockroom'
const DRY_RUN = { name: 'dryRun', required: false, description: 'Validate only; nothing is changed.' } as const

const GENDER: ColumnSpec = {
  name: 'gender',
  kind: 'gender',
  format: 'female | male | diverse | unspecified (or f | m | d | u)',
  description: 'Contact gender (salutation only). Unknown values are ignored with a warning.',
  example: 'female',
}
const FIRST: ColumnSpec = {
  name: 'first_name',
  maxLen: 80,
  format: 'text ≤ 80',
  description: 'Contact first name',
  example: 'Mia',
}
const LAST: ColumnSpec = {
  name: 'last_name',
  required: true,
  maxLen: 80,
  format: 'text ≤ 80',
  description: 'Contact last name',
  example: 'Turner',
}
const EMAIL: ColumnSpec = {
  name: 'email',
  kind: 'email',
  maxLen: 254,
  format: 'email',
  description: 'Contact email (lower-cased). Missing → warning email_missing.',
  example: 'mia.turner@example.com',
}
const COST: ColumnSpec = {
  name: 'cost_center',
  kind: 'key',
  pattern: COST_CENTER,
  maxLen: 20,
  format: '^[A-Z0-9-]{2,20}$',
  description: 'Cost centre (upper-cased); used for region and campus rules',
  example: 'CC-4410',
}
const USER: ColumnSpec = {
  name: 'user_id',
  required: true,
  kind: 'key',
  pattern: USER_ID,
  maxLen: 16,
  format: '^[A-Z0-9]{3,16}$',
  description: 'ITSM user id of the employee (contact upsert key)',
  example: 'E104233',
}

export const ORDER_DETAIL_KEYS: PackedKeySpec[] = [
  {
    key: 'Procurement type',
    name: 'procurement_type',
    required: true,
    kind: 'procurement',
    description: 'Replacement, New hire, Additional device or Removal',
  },
  { key: 'Scope of delivery', name: 'scope_of_delivery', maxLen: 200, description: 'Free text' },
  { key: 'Client component', name: 'client_component', maxLen: 120, description: 'Free text' },
  {
    key: 'Old base device',
    name: 'old_base',
    kind: 'key',
    pattern: ASSET_TAG,
    maxLen: 20,
    description: 'Asset tag of the old base device to collect',
  },
  {
    key: 'Old peripheral 1',
    name: 'old_peripheral_1',
    kind: 'key',
    pattern: ASSET_TAG,
    maxLen: 20,
    description: 'Asset tag of an old peripheral',
  },
  {
    key: 'Old peripheral 2',
    name: 'old_peripheral_2',
    kind: 'key',
    pattern: ASSET_TAG,
    maxLen: 20,
    description: 'Asset tag of an old peripheral',
  },
  {
    key: 'New base device type',
    name: 'new_base',
    maxLen: 120,
    requiredUnlessRemoval: true,
    description:
      'Ordered device type (article internal description); required unless Removal',
  },
  { key: 'New peripheral 1 type', name: 'new_peripheral_1', maxLen: 120, description: 'Device type' },
  { key: 'New peripheral 2 type', name: 'new_peripheral_2', maxLen: 120, description: 'Device type' },
  {
    key: 'Software without approval',
    name: 'requested_software',
    kind: 'software',
    description: "';'-separated software list",
  },
  { key: 'Note', name: 'note', maxLen: 2000, description: 'Note for the rollout team' },
  {
    key: 'On-site contact phone',
    name: 'onsite_contact_phone',
    kind: 'phone',
    description: 'Phone number (invalid → warning, dropped)',
  },
]

export const DELIVERY_ADDRESS_KEYS: PackedKeySpec[] = [
  { key: 'Room', name: 'room', maxLen: 40, description: 'Room' },
  { key: 'Building', name: 'building', maxLen: 40, description: 'Building' },
  { key: 'Street', name: 'street', required: true, maxLen: 160, description: 'Street and number' },
  { key: 'Zip', name: 'zip', required: true, kind: 'zip', description: '4–5 digits (padded to 5)' },
  { key: 'City', name: 'city', required: true, maxLen: 80, description: 'City' },
  { key: 'Country', name: 'country', maxLen: 60, description: 'Default Freeland' },
]

const text = (name: string, maxLen: number, description: string, example?: string | null) => ({
  name,
  maxLen,
  format: `text ≤ ${maxLen}`,
  description,
  example: example ?? null,
})

export const SPECS: Record<ImportType, TypeSpec> = {
  service_requests: {
    type: 'service_requests',
    label: 'Service requests',
    description:
      'Hardware orders from the ITSM export, with packed order details and address.',
    signature: ['order_details'],
    key: 'sr_number',
    columns: [
      {
        name: 'sr_number',
        required: true,
        kind: 'key',
        pattern: SR_NUMBER,
        maxLen: 10,
        format: '^SR[0-9]{7}$',
        description: 'Service request number (upsert key)',
        example: 'SR0012345',
      },
      {
        name: 'task_number',
        kind: 'key',
        pattern: TASK_NUMBER,
        maxLen: 12,
        format: '^TASK[0-9]{7}$',
        description: 'ITSM task number',
        example: 'TASK0045678',
      },
      {
        name: 'itsm_state',
        kind: 'itsm_state',
        maxLen: 40,
        format: ITSM_STATES.join(' | '),
        description: "ITSM state; 'Cancelled' cancels the request",
        example: 'Open',
      },
      {
        ...text(
          'assignment_group',
          120,
          'ITSM assignment group; the hold group puts the request on hardware hold',
          'Workplace Rollout',
        ),
      },
      {
        name: 'opened_at',
        kind: 'datetime',
        format: 'YYYY-MM-DDTHH:MM[:SS][Z|±HH:MM]',
        description: 'Opened in ITSM',
        example: '2026-10-12T08:14:00Z',
      },
      USER,
      text('catalog_item', 160, 'ITSM catalog item', 'Workplace hardware replacement'),
      text('short_description', 2000, 'ITSM short description', 'Replace laptop and dock'),
      {
        name: 'order_details',
        required: true,
        kind: 'packed',
        format: '[Key: value],[Key: value],…',
        description: 'Packed order details (see keys)',
        example: '[Procurement type: Replacement],[New base device type: Laptop Standard 14]',
      },
      {
        name: 'delivery_address',
        required: true,
        kind: 'packed',
        format: '[Key: value],[Key: value],…',
        description: 'Packed delivery address (see keys)',
        example: '[Street: 18 Harbour Road],[Zip: 50110],[City: Westbay]',
      },
      GENDER,
      FIRST,
      LAST,
      EMAIL,
      COST,
    ],
    packed: { order_details: ORDER_DETAIL_KEYS, delivery_address: DELIVERY_ADDRESS_KEYS },
    options: [DRY_RUN],
  },
  lease_returns: {
    type: 'lease_returns',
    label: 'Lease returns',
    description: 'Leased devices approaching their retirement date (ITSM asset export).',
    signature: ['retirement_date'],
    key: 'asset_tag',
    columns: [
      {
        name: 'asset_tag',
        required: true,
        kind: 'key',
        pattern: ASSET_TAG,
        maxLen: 20,
        format: '^[A-Z0-9-]{4,20}$',
        description: 'Asset tag of the leased device (upsert key)',
        example: 'GX101877',
      },
      {
        name: 'serial_number',
        kind: 'key',
        pattern: SERIAL,
        maxLen: 40,
        format: '^[A-Z0-9-]{4,40}$',
        description: 'Serial number',
        example: 'KD7F3K21Q9',
      },
      text('model_category', 80, 'Model category', 'Notebook'),
      {
        name: 'checked_in_date',
        kind: 'date_or_datetime',
        format: 'YYYY-MM-DD or datetime',
        description: 'Goods receipt of the device',
        example: '2023-04-11',
      },
      {
        name: 'retirement_date',
        required: true,
        kind: 'date',
        format: 'YYYY-MM-DD',
        description: 'Lease end',
        example: '2026-12-01',
      },
      text('model', 120, 'Device model', 'Aero 14 G2 Laptop'),
      USER,
      text('install_status', 40, 'ITSM install status', 'In use'),
      text('ci_name', 80, 'CI name', 'NB-40211'),
      GENDER,
      FIRST,
      LAST,
      EMAIL,
      COST,
      {
        name: 'escalation_email',
        kind: 'optional_email',
        maxLen: 254,
        format: 'email',
        description: 'Extra escalation recipient (invalid → warning, ignored)',
        example: null,
      },
    ],
    packed: {},
    options: [
      {
        name: 'markMissingAsProbablyClosed',
        required: false,
        description: "Open lease returns missing from this file are moved to 'Probably closed'.",
      },
      DRY_RUN,
    ],
  },
  contacts: {
    type: 'contacts',
    label: 'Contacts',
    description: 'Employee master data (ITSM user export).',
    signature: ['user_id', 'last_name'],
    key: 'user_id',
    columns: [
      USER,
      GENDER,
      FIRST,
      LAST,
      EMAIL,
      text('phone', 40, 'Phone', '+00 555 0142'),
      text('mobile', 40, 'Mobile'),
      text('department', 120, 'Department', 'Finance'),
      text('street', 160, 'Street', '18 Harbour Road'),
      {
        name: 'zip',
        kind: 'zip',
        format: '4–5 digits',
        description: 'Zip (padded to 5 digits)',
        example: '50110',
      },
      text('city', 80, 'City', 'Westbay'),
      text('building', 40, 'Building', 'B2'),
      text('room', 40, 'Room', '3.14'),
    ],
    packed: {},
    options: [DRY_RUN],
  },
  assets_new: {
    type: 'assets_new',
    label: 'New assets',
    description: 'Goods receipt of new devices from Initech Logistics (received into a hub).',
    signature: ['serial_number'],
    key: 'serial_number',
    columns: [
      text('order_number', 40, 'Partner delivery/order number', 'PO-2610-311'),
      {
        name: 'serial_number',
        required: true,
        kind: 'key',
        pattern: SERIAL,
        maxLen: 40,
        format: '^[A-Z0-9-]{4,40}$',
        description: 'Serial number (upsert key)',
        example: 'KD7F3K21Q9',
      },
      {
        name: 'asset_tag',
        kind: 'key',
        pattern: ASSET_TAG,
        maxLen: 20,
        format: '^[A-Z0-9-]{4,20}$',
        description: 'Asset tag (unique)',
        example: 'GX260001',
      },
      text('external_asset_id', 40, 'ITSM asset id', 'AST482211'),
      text('ci_name', 80, 'CI name'),
      {
        name: 'model',
        required: true,
        maxLen: 80,
        format: 'article model number',
        description: 'Model number; unknown models → warning unknown_model',
        example: 'KD-AERO14-G3',
      },
      {
        name: 'mac_address',
        kind: 'mac',
        format: "12 hex digits, ':' or '-' optional",
        description: 'MAC address (invalid → warning, dropped)',
        example: '02:00:5E:10:20:30',
      },
      {
        name: 'checked_in_date',
        kind: 'date_or_datetime',
        format: 'YYYY-MM-DD or datetime',
        description: 'Goods receipt (default: import time); FIFO key',
        example: '2026-10-12',
      },
    ],
    packed: {},
    options: [
      {
        name: 'targetLocationId',
        required: true,
        description: 'Hub location (goods in or staging) the devices are received into.',
      },
      DRY_RUN,
    ],
  },
  asset_status_sync: {
    type: 'asset_status_sync',
    label: 'Asset status sync',
    description: 'ITSM install states of fleet devices (in use, in transit, returned).',
    signature: ['install_state'],
    key: 'serial_number',
    columns: [
      {
        name: 'serial_number',
        required: true,
        kind: 'key',
        pattern: SERIAL,
        maxLen: 40,
        format: '^[A-Z0-9-]{4,40}$',
        description: 'Serial number (upsert key)',
        example: 'KD7F3K21Q9',
      },
      {
        name: 'install_state',
        required: true,
        maxLen: 40,
        format: 'In use | In transit | In stock',
        description: 'ITSM install state; other values are skipped (unmapped_state)',
        example: 'In use',
      },
      {
        name: 'stockroom',
        maxLen: 80,
        format: 'text',
        description: "'Old device stockroom' marks returned devices",
        example: OLD_DEVICE_STOCKROOM,
      },
      {
        name: 'sr_number',
        kind: 'key',
        pattern: SR_NUMBER,
        maxLen: 10,
        format: '^SR[0-9]{7}$',
        description: 'Service request the device belongs to',
        example: null,
      },
      {
        name: 'assigned_user_id',
        kind: 'key',
        pattern: USER_ID,
        maxLen: 16,
        format: '^[A-Z0-9]{3,16}$',
        description: 'User holding the device (In use)',
        example: 'E104233',
      },
      {
        name: 'asset_tag',
        kind: 'key',
        pattern: ASSET_TAG,
        maxLen: 20,
        format: '^[A-Z0-9-]{4,20}$',
        description: 'Asset tag',
        example: 'GX101877',
      },
      text('model', 80, 'Model number', 'KD-AERO14-G2'),
      text('order_number', 40, 'Order number'),
      text('external_asset_id', 40, 'ITSM asset id'),
      text('ci_name', 80, 'CI name'),
      {
        name: 'mac_address',
        kind: 'mac',
        format: '12 hex digits',
        description: 'MAC address (invalid → warning, dropped)',
      },
      {
        name: 'checked_in_date',
        kind: 'date_or_datetime',
        format: 'YYYY-MM-DD or datetime',
        description: 'Goods receipt',
      },
    ],
    packed: {},
    options: [DRY_RUN],
  },
}

/** SPEC §7.2 — first match wins. */
export const DETECTION_ORDER: ImportType[] = [
  'service_requests',
  'lease_returns',
  'asset_status_sync',
  'assets_new',
  'contacts',
]

export const IMPORT_TYPES: ImportType[] = [
  'lease_returns',
  'service_requests',
  'contacts',
  'assets_new',
  'asset_status_sync',
]

export function detectType(normalized: readonly string[]): ImportType | null {
  const present = new Set(normalized)
  return DETECTION_ORDER.find((type) => SPECS[type].signature.every((h) => present.has(h))) ?? null
}

export function headerAnalysis(
  normalized: readonly string[],
  spec: TypeSpec,
): { missing: string[]; extra: string[] } {
  const present = normalized.filter(Boolean)
  const known = new Set(spec.columns.map((c) => c.name))
  return {
    missing: spec.columns.filter((c) => c.required && !present.includes(c.name)).map((c) => c.name),
    extra: present.filter((h) => !known.has(h)),
  }
}

/** `GET /imports/templates` payload. */
export function importTemplates(): ImportTemplate[] {
  return IMPORT_TYPES.map((type) => {
    const spec = SPECS[type]
    return {
      type,
      label: spec.label,
      description: spec.description,
      signatureHeaders: spec.signature,
      upsertKey: spec.key,
      columns: spec.columns.map((c) => ({
        name: c.name,
        required: Boolean(c.required),
        format: c.format,
        description: c.description,
        example: c.example ?? null,
      })),
      packedFields: Object.entries(spec.packed).map(([column, keys]) => ({
        column,
        keys: keys.map((k) => ({
          key: k.key,
          required: Boolean(k.required || k.requiredUnlessRemoval),
          description: k.description,
        })),
      })),
      options: spec.options,
    }
  })
}
