/**
 * Static enum catalog — the client-side mirror of `GET /meta/enums` (API.md §3.3), built from
 * SPEC §3 (roles, permissions, personas) and §4 (enums, labels, tones, transition maps).
 *
 * The mock backend serves `ENUM_CATALOG` as the `/meta/enums` response; UI code can also use it
 * as a synchronous fallback for labels and tones before the real response has loaded.
 */
import type {
  AssetSource,
  ScanVerdict,
  AppointmentStatus,
  ArticleCategory,
  AssetAction,
  AssetStatus,
  AttentionFlag,
  CallOffOrderStatus,
  DeactivationReason,
  DeliveryType,
  DeviationCategory,
  DeviationCode,
  DeviationOutcome,
  EnumsResponse,
  EnumValue,
  Gender,
  ImportJobStatus,
  ImportType,
  InventoryScanResult,
  InventoryStatus,
  ItemSlot,
  JobKind,
  JobStatus,
  LeaseReturnStatus,
  LocationType,
  MailStatus,
  OsReinstallTiming,
  PipelineStage,
  ProcurementType,
  Readiness,
  RegionRuleMatchKind,
  Role,
  ServiceRequestStatus,
  SiteKind,
  Tone,
  TourStatus,
  TourStopOutcome,
  TransitionDef,
  Trigger,
} from '@/lib/api/types'

// =================================================================================================
// Builders (internal)
// =================================================================================================

interface ValueDef {
  label: string
  description?: string | null
  tone?: Tone | null
  stage?: PipelineStage
  terminal?: boolean
  verdict?: ScanVerdict
}

/**
 * Turns a `value → definition` record into ordered `EnumValue`s. Keying by the enum's union type
 * makes the compiler reject missing and unknown values; `order` follows the declaration order
 * (which mirrors the SPEC tables).
 */
function defineValues<T extends string>(defs: Record<T, ValueDef>): EnumValue[] {
  return (Object.entries(defs) as [T, ValueDef][]).map(([value, def], index) => {
    const entry: EnumValue = {
      value,
      label: def.label,
      description: def.description ?? null,
      tone: def.tone ?? null,
      order: index + 1,
    }
    if (def.stage !== undefined) entry.stage = def.stage
    if (def.terminal !== undefined) entry.terminal = def.terminal
    if (def.verdict !== undefined) entry.verdict = def.verdict
    return entry
  })
}

interface TransitionInput<S extends string> {
  action: string
  label: string
  from: readonly S[]
  to: S | null
  triggers: Trigger[]
  permission: PermissionKey | null
  owner: TransitionDef['owner']
  bulk?: boolean
  requiresComment?: boolean
  destructive?: boolean
}

function defineTransition<S extends string>(input: TransitionInput<S>): TransitionDef {
  return {
    action: input.action,
    label: input.label,
    from: [...input.from],
    to: input.to,
    triggers: input.triggers,
    permission: input.permission,
    bulk: input.bulk ?? false,
    requiresComment: input.requiresComment ?? false,
    destructive: input.destructive ?? false,
    owner: input.owner,
  }
}

// =================================================================================================
// Permissions (SPEC §3.2)
// =================================================================================================

export const PERMISSION_KEYS = [
  'sr.read',
  'sr.update',
  'sr.comms',
  'sr.manage',
  'sr.export',
  'lease.read',
  'lease.manage',
  'lease.export',
  'contacts.update',
  'comms.read',
  'comms.dispatch',
  'comms.settings',
  'staging.scan',
  'staging.personalize',
  'staging.close',
  'fulfilment.pick',
  'fulfilment.ship',
  'appointments.read',
  'appointments.manage',
  'tours.read',
  'tours.plan',
  'tours.execute_own',
  'tours.execute_any',
  'stock.read',
  'stock.recalculate',
  'stock.buffers',
  'calloff.manage',
  'assets.update',
  'assets.deactivate',
  'assets.export',
  'inventory.read',
  'inventory.scan',
  'inventory.manage',
  'imports.read',
  'imports.create',
  'master.read',
  'master.manage',
  'users.read',
  'users.manage',
  'dashboard.read',
  'demo.reset',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

/** SPEC §3.2 "Covers" column. */
const PERMISSION_LABELS: Record<PermissionKey, string> = {
  'sr.read': 'SR list/detail/history, pipeline',
  'sr.update': 'PATCH SR fields, region override',
  'sr.comms': 'SR mail actions, pause/resume, hold, VIP release',
  'sr.manage': 'cancel, reopen, complete_manually',
  'sr.export': 'SR xlsx export',
  'lease.read': 'lease list/detail/history/comments read',
  'lease.manage': 'lease actions, PATCH, add comment',
  'lease.export': 'lease xlsx export',
  'contacts.update': 'PATCH contact',
  'comms.read': 'mail log, dispatch runs, templates',
  'comms.dispatch': 'run dispatch now / dry-run',
  'comms.settings': 'dispatch settings write',
  'staging.scan': 'installation place scan station',
  'staging.personalize': 'claim/release/assign/finish/skip/reopen, staging fields',
  'staging.close': 'order closing',
  'fulfilment.pick': 'technician picking (mark_provided)',
  'fulfilment.ship': 'parcel packing scans, shipments, close without label',
  'appointments.read': 'calendars, appointments',
  'appointments.manage': 'sync now, book, link unmatched, reschedule request',
  'tours.read': 'all tours',
  'tours.plan': 'create/edit/assign/cancel tours',
  'tours.execute_own': 'start own tour, deployment of own stops, protocol',
  'tours.execute_any': 'deployment on any tour',
  'stock.read': 'stock matrix, call-off list, assets list/detail, deactivation history',
  'stock.recalculate': 'trigger recalculation',
  'stock.buffers': 'edit buffers',
  'calloff.manage': 'create/edit/send/cancel call-off orders',
  'assets.update': 'asset correction, mark missing/found, bulk',
  'assets.deactivate': 'deactivation upload',
  'assets.export': 'asset / stock CSV export',
  'inventory.read': 'inventories list/detail/reports',
  'inventory.scan': 'scan into open inventory, undo own scan',
  'inventory.manage': 'open/close/cancel inventory',
  'imports.read': 'import list/detail/errors',
  'imports.create': 'upload/cancel imports',
  'master.read': 'articles, regions, rules, calendars, VIP list',
  'master.manage': 'write articles, regions, rules, calendars, VIP list',
  'users.read': 'GET /users (names, roles)',
  'users.manage': 'create/edit/deactivate users, reset password',
  'dashboard.read': 'dashboard KPIs',
  'demo.reset': 'reset demo data',
}

/** SPEC §3.2 matrix — exactly the ticked cells per role. */
export const ROLE_PERMISSIONS: Record<Role, readonly PermissionKey[]> = {
  viewer: [
    'sr.read',
    'lease.read',
    'comms.read',
    'appointments.read',
    'tours.read',
    'stock.read',
    'inventory.read',
    'imports.read',
    'master.read',
    'users.read',
    'dashboard.read',
  ],
  technician: [
    'sr.read',
    'lease.read',
    'staging.scan',
    'appointments.read',
    'tours.read',
    'tours.execute_own',
    'stock.read',
    'inventory.read',
    'inventory.scan',
    'master.read',
    'users.read',
    'dashboard.read',
  ],
  dispatcher: [
    'sr.read',
    'sr.update',
    'sr.comms',
    'sr.manage',
    'sr.export',
    'lease.read',
    'lease.manage',
    'lease.export',
    'contacts.update',
    'comms.read',
    'comms.dispatch',
    'comms.settings',
    'staging.scan',
    'staging.personalize',
    'staging.close',
    'fulfilment.pick',
    'fulfilment.ship',
    'appointments.read',
    'appointments.manage',
    'tours.read',
    'tours.plan',
    'tours.execute_own',
    'tours.execute_any',
    'stock.read',
    'stock.recalculate',
    'stock.buffers',
    'calloff.manage',
    'assets.update',
    'assets.deactivate',
    'assets.export',
    'inventory.read',
    'inventory.scan',
    'inventory.manage',
    'imports.read',
    'imports.create',
    'master.read',
    'users.read',
    'dashboard.read',
  ],
  admin: PERMISSION_KEYS,
}

// =================================================================================================
// Status sets (SPEC §4.1–§4.3)
// =================================================================================================

/** All SR statuses in SPEC §4.1 table order. */
const SR_STATUSES: readonly ServiceRequestStatus[] = [
  'imported',
  'imported_vip',
  'hardware_unavailable',
  'invited',
  'campus_info_sent',
  'reminder_1_sent',
  'reminder_2_sent',
  'escalated',
  'appointment_booked',
  'personalization_in_progress',
  'personalization_done',
  'ready_for_picking',
  'shipped',
  'provided',
  'reschedule_needed',
  'completed',
  'cancelled',
]

export const SR_TERMINAL_STATUSES: readonly ServiceRequestStatus[] = ['completed', 'cancelled']

/** Every SR status except `completed`, `cancelled`. */
export const SR_NON_TERMINAL_STATUSES: readonly ServiceRequestStatus[] = SR_STATUSES.filter(
  (status) => !SR_TERMINAL_STATUSES.includes(status),
)

/** `PRE_APPT` (SPEC §4.1). */
export const SR_PRE_APPT_STATUSES: readonly ServiceRequestStatus[] = [
  'imported',
  'imported_vip',
  'invited',
  'campus_info_sent',
  'reminder_1_sent',
  'reminder_2_sent',
  'escalated',
  'reschedule_needed',
]

/** `WITH_APPT` (SPEC §4.1). */
export const SR_WITH_APPT_STATUSES: readonly ServiceRequestStatus[] = [
  'appointment_booked',
  'personalization_in_progress',
  'personalization_done',
  'ready_for_picking',
  'provided',
  'shipped',
]

/** Every lease return status except `closed` (SPEC §4.2). */
const LEASE_NON_TERMINAL_STATUSES: readonly LeaseReturnStatus[] = [
  'imported',
  'imported_vip',
  'info_sent',
  'reminder_1_sent',
  'reminder_2_sent',
  'escalated',
  'replacement_ordered',
  'probably_closed',
]

const ASSET_STATUSES: readonly AssetStatus[] = [
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
]

// =================================================================================================
// Transition maps
// =================================================================================================

/** SPEC §4.1.1 (without the internal `import_create`). */
const SR_TRANSITIONS: TransitionDef[] = [
  defineTransition<ServiceRequestStatus>({
    action: 'send_invitation',
    label: 'Send booking invitation',
    from: ['imported'],
    to: 'invited',
    triggers: ['user', 'job'],
    permission: 'sr.comms',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'send_campus_info',
    label: 'Send campus info',
    from: ['imported'],
    to: 'campus_info_sent',
    triggers: ['user', 'job'],
    permission: 'sr.comms',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'send_reminder_1',
    label: 'Send reminder 1',
    from: ['invited'],
    to: 'reminder_1_sent',
    triggers: ['user', 'job'],
    permission: 'sr.comms',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'send_reminder_2',
    label: 'Send reminder 2',
    from: ['reminder_1_sent'],
    to: 'reminder_2_sent',
    triggers: ['user', 'job'],
    permission: 'sr.comms',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'escalate',
    label: 'Escalate',
    from: ['reminder_2_sent'],
    to: 'escalated',
    triggers: ['user', 'job'],
    permission: 'sr.comms',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'send_next_mail',
    label: 'Send next mail',
    from: ['imported', 'invited', 'reminder_1_sent', 'reminder_2_sent'],
    to: null,
    triggers: ['user'],
    permission: 'sr.comms',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'mark_hardware_unavailable',
    label: 'Mark hardware unavailable',
    from: [
      'imported',
      'invited',
      'campus_info_sent',
      'reminder_1_sent',
      'reminder_2_sent',
      'escalated',
    ],
    to: 'hardware_unavailable',
    triggers: ['user', 'import'],
    permission: 'sr.comms',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'release_hardware_hold',
    label: 'Release hardware hold',
    from: ['hardware_unavailable'],
    to: 'imported',
    triggers: ['user'],
    permission: 'sr.comms',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'release_vip',
    label: 'Release to standard flow',
    from: ['imported_vip'],
    to: 'imported',
    triggers: ['user'],
    permission: 'sr.comms',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'pause_communication',
    label: 'Pause communication',
    from: SR_NON_TERMINAL_STATUSES,
    to: null,
    triggers: ['user'],
    permission: 'sr.comms',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'resume_communication',
    label: 'Resume communication',
    from: SR_NON_TERMINAL_STATUSES,
    to: null,
    triggers: ['user'],
    permission: 'sr.comms',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'book_appointment',
    label: 'Book appointment',
    from: SR_PRE_APPT_STATUSES,
    to: 'appointment_booked',
    triggers: ['user'],
    permission: 'appointments.manage',
    owner: 'h4',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'appointment_synced',
    label: 'Appointment synced',
    from: SR_PRE_APPT_STATUSES,
    to: 'appointment_booked',
    triggers: ['sync'],
    permission: null,
    owner: 'h4',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'appointment_cancelled',
    label: 'Appointment cancelled',
    from: SR_WITH_APPT_STATUSES,
    to: 'reschedule_needed',
    triggers: ['sync'],
    permission: null,
    owner: 'h4',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'request_reschedule',
    label: 'Request reschedule',
    from: SR_WITH_APPT_STATUSES,
    to: 'reschedule_needed',
    triggers: ['user'],
    permission: 'appointments.manage',
    owner: 'h4',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'claim',
    label: 'Claim',
    from: ['appointment_booked', 'personalization_in_progress'],
    to: 'personalization_in_progress',
    triggers: ['user'],
    permission: 'staging.personalize',
    owner: 'h3',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'release',
    label: 'Release',
    from: ['personalization_in_progress'],
    to: 'appointment_booked',
    triggers: ['user'],
    permission: 'staging.personalize',
    owner: 'h3',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'finish_personalization',
    label: 'Finish personalization',
    from: ['personalization_in_progress'],
    to: 'personalization_done',
    triggers: ['user'],
    permission: 'staging.personalize',
    owner: 'h3',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'skip_preparation',
    label: 'Skip preparation',
    from: ['personalization_in_progress', 'appointment_booked'],
    to: 'ready_for_picking',
    triggers: ['user'],
    permission: 'staging.personalize',
    owner: 'h3',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'reopen_personalization',
    label: 'Reopen personalization',
    from: ['personalization_done'],
    to: 'personalization_in_progress',
    triggers: ['user'],
    permission: 'staging.personalize',
    owner: 'h3',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'close_order',
    label: 'Close order',
    from: ['personalization_done'],
    to: 'ready_for_picking',
    triggers: ['user'],
    permission: 'staging.close',
    owner: 'h3',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'mark_provided',
    label: 'Mark provided',
    from: ['ready_for_picking'],
    to: 'provided',
    triggers: ['user'],
    permission: 'fulfilment.pick',
    bulk: true,
    owner: 'h3',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'ship',
    label: 'Create shipment',
    from: ['ready_for_picking'],
    to: 'shipped',
    triggers: ['user'],
    permission: 'fulfilment.ship',
    owner: 'h3',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'close_without_label',
    label: 'Close without label',
    from: ['ready_for_picking'],
    to: 'provided',
    triggers: ['user'],
    permission: 'fulfilment.ship',
    requiresComment: true,
    owner: 'h3',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'complete_deployment',
    label: 'Complete',
    from: ['provided', 'shipped'],
    to: 'completed',
    triggers: ['user'],
    permission: 'tours.execute_own',
    owner: 'h4',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'reschedule_on_site',
    label: 'Reschedule',
    from: ['provided', 'shipped'],
    to: 'reschedule_needed',
    triggers: ['user'],
    permission: 'tours.execute_own',
    owner: 'h4',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'cancel_on_site',
    label: 'Cancel on site',
    from: ['provided', 'shipped'],
    to: 'cancelled',
    triggers: ['user'],
    permission: 'tours.execute_own',
    destructive: true,
    owner: 'h4',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'complete_manually',
    label: 'Complete manually',
    from: ['provided', 'shipped'],
    to: 'completed',
    triggers: ['user'],
    permission: 'sr.manage',
    requiresComment: true,
    owner: 'h4',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'cancel',
    label: 'Cancel request',
    from: SR_NON_TERMINAL_STATUSES,
    to: 'cancelled',
    triggers: ['user', 'import'],
    permission: 'sr.manage',
    bulk: true,
    requiresComment: true,
    destructive: true,
    owner: 'h1',
  }),
  defineTransition<ServiceRequestStatus>({
    action: 'reopen',
    label: 'Reopen',
    from: ['cancelled'],
    // `imported`, or `imported_vip` when the SR is VIP.
    to: 'imported',
    triggers: ['user'],
    permission: 'sr.manage',
    owner: 'h1',
  }),
]

/** SPEC §4.2 (without the internal `import_create`). */
const LEASE_TRANSITIONS: TransitionDef[] = [
  defineTransition<LeaseReturnStatus>({
    action: 'send_info',
    label: 'Send info mail',
    from: ['imported'],
    to: 'info_sent',
    triggers: ['user', 'job'],
    permission: 'lease.manage',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<LeaseReturnStatus>({
    action: 'send_reminder_1',
    label: 'Send reminder 1',
    from: ['info_sent'],
    to: 'reminder_1_sent',
    triggers: ['user', 'job'],
    permission: 'lease.manage',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<LeaseReturnStatus>({
    action: 'send_reminder_2',
    label: 'Send reminder 2',
    from: ['reminder_1_sent'],
    to: 'reminder_2_sent',
    triggers: ['user', 'job'],
    permission: 'lease.manage',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<LeaseReturnStatus>({
    action: 'escalate',
    label: 'Escalate',
    from: ['reminder_2_sent'],
    to: 'escalated',
    triggers: ['user', 'job'],
    permission: 'lease.manage',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<LeaseReturnStatus>({
    action: 'send_next_mail',
    label: 'Send next mail',
    from: ['imported', 'info_sent', 'reminder_1_sent', 'reminder_2_sent'],
    to: null,
    triggers: ['user'],
    permission: 'lease.manage',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<LeaseReturnStatus>({
    action: 'release_vip',
    label: 'Release to standard flow',
    from: ['imported_vip'],
    to: 'imported',
    triggers: ['user'],
    permission: 'lease.manage',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<LeaseReturnStatus>({
    action: 'link_service_request',
    label: 'Link service request',
    from: [
      'imported',
      'imported_vip',
      'info_sent',
      'reminder_1_sent',
      'reminder_2_sent',
      'escalated',
      'probably_closed',
    ],
    to: 'replacement_ordered',
    triggers: ['import', 'user'],
    permission: 'lease.manage',
    owner: 'h1',
  }),
  defineTransition<LeaseReturnStatus>({
    action: 'unlink_service_request',
    label: 'Unlink service request',
    from: ['replacement_ordered'],
    // Restored status (SPEC §4.2), computed.
    to: null,
    triggers: ['user'],
    permission: 'lease.manage',
    owner: 'h1',
  }),
  defineTransition<LeaseReturnStatus>({
    action: 'mark_probably_closed',
    label: 'Mark probably closed',
    from: [
      'imported',
      'imported_vip',
      'info_sent',
      'reminder_1_sent',
      'reminder_2_sent',
      'escalated',
    ],
    to: 'probably_closed',
    triggers: ['import'],
    permission: 'imports.create',
    owner: 'h2',
  }),
  defineTransition<LeaseReturnStatus>({
    action: 'close',
    label: 'Close',
    from: LEASE_NON_TERMINAL_STATUSES,
    to: 'closed',
    triggers: ['user', 'system'],
    permission: 'lease.manage',
    bulk: true,
    requiresComment: true,
    owner: 'h1',
  }),
  defineTransition<LeaseReturnStatus>({
    action: 'reopen',
    label: 'Reopen',
    from: ['closed', 'probably_closed'],
    // Restored status (SPEC §4.2), computed.
    to: null,
    triggers: ['user', 'import'],
    permission: 'lease.manage',
    owner: 'h1',
  }),
  defineTransition<LeaseReturnStatus>({
    action: 'pause_communication',
    label: 'Pause communication',
    from: LEASE_NON_TERMINAL_STATUSES,
    to: null,
    triggers: ['user'],
    permission: 'lease.manage',
    bulk: true,
    owner: 'h1',
  }),
  defineTransition<LeaseReturnStatus>({
    action: 'resume_communication',
    label: 'Resume communication',
    from: LEASE_NON_TERMINAL_STATUSES,
    to: null,
    triggers: ['user'],
    permission: 'lease.manage',
    bulk: true,
    owner: 'h1',
  }),
]

/** SPEC §4.3 user-facing asset actions (API.md §3.8). */
const ASSET_TRANSITIONS: TransitionDef[] = [
  defineTransition<AssetStatus>({
    action: 'mark_missing',
    label: 'Mark missing',
    from: ['available', 'collected'],
    to: 'missing',
    triggers: ['user', 'system'],
    permission: 'assets.update',
    bulk: true,
    owner: 'h5',
  }),
  defineTransition<AssetStatus>({
    action: 'mark_found',
    label: 'Mark found',
    from: ['missing'],
    // `available` or `collected`, by the target location type.
    to: null,
    triggers: ['user'],
    permission: 'assets.update',
    owner: 'h5',
  }),
  defineTransition<AssetStatus>({
    action: 'correct',
    label: 'Correct status/location',
    from: ASSET_STATUSES,
    to: null,
    triggers: ['user'],
    permission: 'assets.update',
    bulk: true,
    owner: 'h5',
  }),
]

// =================================================================================================
// Scan result codes (SPEC §6.6, §6.9, §6.11, §6.16, §6.17 + SPEC_RESOLUTIONS #25)
// The verdict alone picks banner tone and sound; the code only selects the wording.
// =================================================================================================

export type ScanCode =
  | 'placed'
  | 'unchanged'
  | 'undone'
  | 'place_occupied'
  | 'moved_from_other_site'
  | 'unknown_model'
  | 'invalid_place'
  | 'not_available'
  | 'not_in_stock'
  | 'assigned'
  | 'not_fifo'
  | 'unknown_article'
  | 'wrong_article'
  | 'no_installation_place'
  | 'packed'
  | 'already_packed'
  | 'not_on_this_request'
  | 'new_verified'
  | 'old_verified'
  | 'already_verified'
  | 'belongs_to_other_sr'
  | 'unknown_device'
  | 'matched'
  | 'wrong_location'
  | 'wrong_zone'
  | 'wrong_site'
  | 'duplicate'
  | 'unknown_serial'

const SCAN_CODES: Record<ScanCode, ValueDef> = {
  placed: { label: 'Placed', tone: 'done', verdict: 'ok' },
  unchanged: { label: 'Already there', tone: 'done', verdict: 'ok' },
  undone: { label: 'Undone', tone: 'done', verdict: 'ok' },
  assigned: { label: 'Assigned', tone: 'done', verdict: 'ok' },
  packed: { label: 'Packed', tone: 'done', verdict: 'ok' },
  already_packed: { label: 'Already packed', tone: 'done', verdict: 'ok' },
  new_verified: { label: 'New device verified', tone: 'done', verdict: 'ok' },
  old_verified: { label: 'Old device verified', tone: 'done', verdict: 'ok' },
  already_verified: { label: 'Already verified', tone: 'done', verdict: 'ok' },
  matched: { label: 'OK', tone: 'done', verdict: 'ok' },
  place_occupied: { label: 'Place occupied', tone: 'caution', verdict: 'warning' },
  moved_from_other_site: { label: 'Moved from other hub', tone: 'caution', verdict: 'warning' },
  unknown_model: { label: 'Unknown model', tone: 'caution', verdict: 'warning' },
  not_fifo: { label: 'Not the oldest', tone: 'caution', verdict: 'warning' },
  unknown_device: { label: 'Unknown device', tone: 'caution', verdict: 'warning' },
  wrong_location: { label: 'Wrong location', tone: 'caution', verdict: 'warning' },
  wrong_zone: { label: 'Wrong location', tone: 'caution', verdict: 'warning' },
  wrong_site: { label: 'Wrong location', tone: 'caution', verdict: 'warning' },
  duplicate: { label: 'Duplicate', tone: 'caution', verdict: 'warning' },
  invalid_place: { label: 'Invalid place', tone: 'critical', verdict: 'error' },
  not_available: { label: 'Not available', tone: 'critical', verdict: 'error' },
  not_in_stock: { label: 'Not in stock', tone: 'critical', verdict: 'error' },
  unknown_article: { label: 'Unknown device type', tone: 'critical', verdict: 'error' },
  wrong_article: { label: 'Wrong article', tone: 'critical', verdict: 'error' },
  no_installation_place: { label: 'No installation place', tone: 'critical', verdict: 'error' },
  not_on_this_request: { label: 'Not on this request', tone: 'critical', verdict: 'error' },
  belongs_to_other_sr: { label: 'Belongs to another request', tone: 'critical', verdict: 'error' },
  unknown_serial: { label: 'Unknown serial', tone: 'critical', verdict: 'error' },
}

// =================================================================================================
// Enum catalog (SPEC §4)
// =================================================================================================

export const ENUM_CATALOG: EnumsResponse = {
  // ---- §4.1 ----
  serviceRequestStatus: defineValues<ServiceRequestStatus>({
    imported: {
      label: 'Imported',
      stage: 'imported',
      tone: 'intake',
      terminal: false,
      description: 'New from ITSM import; waiting for first mail',
    },
    imported_vip: {
      label: 'Imported · VIP',
      stage: 'imported',
      tone: 'intake',
      terminal: false,
      description: 'Requester on VIP list; no automatic mails',
    },
    hardware_unavailable: {
      label: 'Hardware unavailable',
      stage: 'imported',
      tone: 'caution',
      terminal: false,
      description: 'On hardware hold (ITSM hold group or dispatcher); user informed once',
    },
    invited: {
      label: 'Invited',
      stage: 'invited',
      tone: 'outreach',
      terminal: false,
      description: 'Invitation with booking link sent',
    },
    campus_info_sent: {
      label: 'Campus info sent',
      stage: 'invited',
      tone: 'outreach',
      terminal: false,
      description: 'Campus user told a technician will call',
    },
    reminder_1_sent: {
      label: 'Reminder 1 sent',
      stage: 'invited',
      tone: 'outreach',
      terminal: false,
    },
    reminder_2_sent: {
      label: 'Reminder 2 sent',
      stage: 'invited',
      tone: 'outreach',
      terminal: false,
    },
    escalated: {
      label: 'Escalated',
      stage: 'invited',
      tone: 'critical',
      terminal: false,
      description: 'Escalation mail sent (cc escalation mailbox)',
    },
    appointment_booked: {
      label: 'Appointment booked',
      stage: 'booked',
      tone: 'booked',
      terminal: false,
      description: 'Appointment exists; ready for staging',
    },
    personalization_in_progress: {
      label: 'Personalizing',
      stage: 'personalizing',
      tone: 'workshop',
      terminal: false,
      description: 'Claimed by an editor',
    },
    personalization_done: {
      label: 'Personalization done',
      stage: 'personalizing',
      tone: 'workshop',
      terminal: false,
      description: 'Devices assigned; awaiting order closing',
    },
    ready_for_picking: {
      label: 'Ready for picking',
      stage: 'ready',
      tone: 'workshop',
      terminal: false,
      description: 'Order closed; assets prepared at goods-out',
    },
    shipped: {
      label: 'Shipped',
      stage: 'delivery',
      tone: 'transit',
      terminal: false,
      description: 'Parcel label created, hardware with parcel carrier',
    },
    provided: {
      label: 'Provided',
      stage: 'delivery',
      tone: 'transit',
      terminal: false,
      description: 'Handed to technician (or closed without label)',
    },
    reschedule_needed: {
      label: 'Reschedule needed',
      stage: 'delivery',
      tone: 'caution',
      terminal: false,
      description:
        'Appointment cancelled/failed; waiting for a new one; the resume status remembers where to continue',
    },
    completed: {
      label: 'Deployed',
      stage: 'deployed',
      tone: 'done',
      terminal: true,
      description: 'Deployment done (or completed manually)',
    },
    cancelled: {
      label: 'Cancelled',
      stage: 'closed',
      tone: 'intake',
      terminal: true,
      description: 'Cancelled (dispatcher, on site, or ITSM state Cancelled)',
    },
  }),
  pipelineStage: defineValues<PipelineStage>({
    imported: { label: 'Imported', tone: 'intake' },
    invited: { label: 'Invited', tone: 'outreach' },
    booked: { label: 'Booked', tone: 'booked' },
    personalizing: { label: 'Personalizing', tone: 'workshop' },
    ready: { label: 'Ready', tone: 'workshop' },
    delivery: {
      label: 'Shipped / provided',
      tone: 'transit',
      description: 'Also holds reschedule_needed as a caution state',
    },
    deployed: { label: 'Deployed', tone: 'done' },
    closed: { label: 'Closed', tone: 'intake', description: 'Holds cancelled requests only' },
  }),

  // ---- §4.2 ----
  leaseReturnStatus: defineValues<LeaseReturnStatus>({
    imported: {
      label: 'Imported',
      tone: 'intake',
      terminal: false,
      description: 'Waiting for the info mail window',
    },
    imported_vip: {
      label: 'Imported · VIP',
      tone: 'intake',
      terminal: false,
      description: 'No automatic mails',
    },
    info_sent: {
      label: 'Info sent',
      tone: 'outreach',
      terminal: false,
      description: 'Info mail sent',
    },
    reminder_1_sent: { label: 'Reminder 1 sent', tone: 'outreach', terminal: false },
    reminder_2_sent: { label: 'Reminder 2 sent', tone: 'outreach', terminal: false },
    escalated: { label: 'Escalated', tone: 'critical', terminal: false },
    replacement_ordered: {
      label: 'Replacement ordered',
      tone: 'done',
      terminal: false,
      description: 'Linked to an SR that names this asset as old device',
    },
    probably_closed: {
      label: 'Probably closed',
      tone: 'intake',
      terminal: false,
      description: 'Missing from the latest full lease import — needs review',
    },
    closed: {
      label: 'Closed',
      tone: 'intake',
      terminal: true,
      description: 'Device collected, deactivated, or closed manually',
    },
  }),

  // ---- §4.3 ----
  assetStatus: defineValues<AssetStatus>({
    available: {
      label: 'Available',
      tone: 'intake',
      terminal: false,
      description: 'In hub stock (goods in or staging), not linked to an SR',
    },
    assigned: {
      label: 'Assigned to SR',
      tone: 'workshop',
      terminal: false,
      description: 'Reserved for an SR item during personalization',
    },
    prepared: {
      label: 'Prepared',
      tone: 'workshop',
      terminal: false,
      description: 'Prep done, waiting at goods out for picking',
    },
    provided: {
      label: 'Provided',
      tone: 'transit',
      terminal: false,
      description: 'Handed over for delivery (in transit)',
    },
    in_use: {
      label: 'In use',
      tone: 'done',
      terminal: false,
      description: 'At a user (deployed new device, or old device still in use)',
    },
    collected: {
      label: 'Return pending',
      tone: 'transit',
      terminal: false,
      description:
        'Old device collected, at a hub/Campus return location, waiting to leave the fleet',
    },
    missing: {
      label: 'Missing',
      tone: 'critical',
      terminal: false,
      description: 'Not found in inventory; location kept as last known',
    },
    deactivated_returned: {
      label: 'Deactivated · returned',
      tone: 'intake',
      terminal: true,
      description: 'Left the fleet',
    },
    deactivated_bought_out: {
      label: 'Deactivated · bought out',
      tone: 'intake',
      terminal: true,
      description: 'Left the fleet',
    },
    deactivated_disposed: {
      label: 'Deactivated · disposed',
      tone: 'intake',
      terminal: true,
      description: 'Left the fleet',
    },
  }),
  locationType: defineValues<LocationType>({
    goods_in: { label: 'Goods in', description: 'Hub stock location' },
    staging: { label: 'Staging', description: 'Hub stock location; holds installation places' },
    goods_out: {
      label: 'Goods out',
      description: 'Hub stock location; prepared assets for picking',
    },
    return: { label: 'Returns', description: 'Hub or Campus location for collected devices' },
    in_transit: { label: 'In transit', description: 'With technician, courier or parcel carrier' },
    in_use: { label: 'At user', description: 'Deployed at a user' },
    off_fleet: { label: 'Off fleet', description: 'Left the fleet (deactivated)' },
  }),

  // ---- §4.4 ----
  deliveryType: defineValues<DeliveryType>({
    technician: { label: 'Technician delivery' },
    parcel_to_user: { label: 'Parcel to user' },
    parcel_to_pickup_point: { label: 'Parcel to pickup point' },
  }),

  // ---- §4.10 ----
  procurementType: defineValues<ProcurementType>({
    replacement: { label: 'Replacement' },
    new_hire: { label: 'New hire' },
    additional_device: { label: 'Additional device' },
    removal: { label: 'Removal only' },
  }),
  itemSlot: defineValues<ItemSlot>({
    new_base: { label: 'New base device', description: 'Deliver' },
    new_peripheral_1: { label: 'New peripheral 1', description: 'Deliver' },
    new_peripheral_2: { label: 'New peripheral 2', description: 'Deliver' },
    old_base: { label: 'Old base device', description: 'Collect' },
    old_peripheral_1: { label: 'Old peripheral 1', description: 'Collect' },
    old_peripheral_2: { label: 'Old peripheral 2', description: 'Collect' },
  }),
  osReinstallTiming: defineValues<OsReinstallTiming>({
    on_pickup: {
      label: 'On pickup',
      description: 'Wipe & reinstall old device when collected',
    },
    on_delivery: {
      label: 'On delivery',
      description: "Fresh OS install on the new device at the user's desk",
    },
  }),
  deactivationReason: defineValues<DeactivationReason>({
    returned_to_lessor: { label: 'Returned to lessor', description: 'Deactivated · returned' },
    bought_out: { label: 'Bought out', description: 'Deactivated · bought out' },
    disposed: { label: 'Disposed', description: 'Deactivated · disposed' },
  }),
  gender: defineValues<Gender>({
    female: { label: 'Female', description: 'Salutation "Dear Ms {last}"' },
    male: { label: 'Male', description: 'Salutation "Dear Mr {last}"' },
    diverse: { label: 'Diverse', description: 'Salutation "Dear {first} {last}"' },
    unspecified: { label: 'Unspecified', description: 'Salutation "Dear {first} {last}"' },
  }),
  role: defineValues<Role>({
    viewer: {
      label: 'Viewer',
      description:
        'Read-only access to every operational screen (no admin screens, no personal data exports)',
    },
    technician: {
      label: 'Technician',
      description:
        'Everything viewer can read plus own tours, deployment of own tour stops, all scan stations',
    },
    dispatcher: {
      label: 'Dispatcher',
      description:
        'Everything operational: requests, comms, imports, staging, picking, shipping, tour planning, appointments, stock/call-off, inventory, asset corrections, deactivation',
    },
    admin: {
      label: 'Admin',
      description: 'Dispatcher plus master data, users, demo reset',
    },
  }),
  siteKind: defineValues<SiteKind>({
    hub: { label: 'Hub' },
    campus: { label: 'Campus' },
  }),
  regionRuleMatchKind: defineValues<RegionRuleMatchKind>({
    cost_center: { label: 'Cost center' },
    zip: { label: 'ZIP code' },
    zip_prefix: { label: 'ZIP prefix' },
    city: { label: 'City' },
  }),
  articleCategory: defineValues<ArticleCategory>({
    laptop: { label: 'Laptop' },
    desktop: { label: 'Desktop' },
    tablet: { label: 'Tablet' },
    docking_station: { label: 'Docking station' },
    monitor: { label: 'Monitor' },
    headset: { label: 'Headset' },
    keyboard: { label: 'Keyboard' },
    mouse: { label: 'Mouse' },
    webcam: { label: 'Webcam' },
    bag: { label: 'Bag' },
    accessory: { label: 'Accessory' },
  }),

  // ---- §4.5 ----
  importType: defineValues<ImportType>({
    lease_returns: { label: 'Lease returns', description: 'Upsert key asset_tag' },
    service_requests: { label: 'Service requests', description: 'Upsert key sr_number' },
    contacts: { label: 'Contacts', description: 'Upsert key user_id' },
    assets_new: { label: 'New assets', description: 'Upsert key serial_number' },
    asset_status_sync: { label: 'Asset status sync', description: 'Upsert key serial_number' },
  }),
  importJobStatus: defineValues<ImportJobStatus>({
    queued: { label: 'Queued', tone: 'intake', terminal: false },
    processing: { label: 'Importing', tone: 'outreach', terminal: false },
    completed: { label: 'Imported', tone: 'done', terminal: true },
    completed_with_errors: { label: 'Imported with issues', tone: 'caution', terminal: true },
    failed: { label: 'Failed', tone: 'critical', terminal: true },
    cancelled: { label: 'Cancelled', tone: 'intake', terminal: true },
  }),

  // ---- §4.6 ----
  inventoryStatus: defineValues<InventoryStatus>({
    open: { label: 'Counting', tone: 'booked', terminal: false },
    closed: { label: 'Closed', tone: 'intake', terminal: true },
    cancelled: { label: 'Cancelled', tone: 'intake', terminal: true },
  }),
  inventoryScanResult: defineValues<InventoryScanResult>({
    matched: { label: 'Matched', tone: 'done' },
    wrong_location: { label: 'Wrong location', tone: 'caution' },
    unknown: { label: 'Unknown', tone: 'critical' },
  }),

  // ---- §4.7 ----
  tourStatus: defineValues<TourStatus>({
    draft: { label: 'No technician', tone: 'caution', terminal: false },
    planned: { label: 'Assigned', tone: 'booked', terminal: false },
    in_progress: { label: 'On the road', tone: 'transit', terminal: false },
    completed: { label: 'Done', tone: 'done', terminal: true },
    cancelled: { label: 'Cancelled', tone: 'intake', terminal: true },
  }),
  tourStopOutcome: defineValues<TourStopOutcome>({
    pending: { label: 'Pending', tone: 'intake', terminal: false },
    completed: { label: 'Done', tone: 'done', terminal: true },
    rescheduled: { label: 'Rescheduled', tone: 'caution', terminal: true },
    cancelled: { label: 'Cancelled', tone: 'critical', terminal: true },
  }),

  // ---- §4.8 ----
  callOffOrderStatus: defineValues<CallOffOrderStatus>({
    draft: { label: 'Draft', tone: 'intake', terminal: false },
    sent: { label: 'Sent to Initech Logistics', tone: 'outreach', terminal: true },
    cancelled: { label: 'Cancelled', tone: 'intake', terminal: true },
  }),

  // ---- §4.9 ----
  jobStatus: defineValues<JobStatus>({
    queued: { label: 'Queued', tone: 'intake', terminal: false },
    running: { label: 'Running', tone: 'outreach', terminal: false },
    succeeded: { label: 'Succeeded', tone: 'done', terminal: true },
    failed: { label: 'Failed', tone: 'critical', terminal: true },
    cancelled: { label: 'Cancelled', tone: 'intake', terminal: true },
  }),
  jobKind: defineValues<JobKind>({
    import: { label: 'Import' },
    appointments_sync: { label: 'Appointment sync' },
    stock_recalculate: { label: 'Stock recalculation' },
    comms_dispatch: { label: 'Mail dispatch' },
    regions_reapply: { label: 'Region re-apply' },
    demo_reset: { label: 'Demo reset' },
  }),

  // ---- §4.10 ----
  deviationCategory: defineValues<DeviationCategory>({
    provider_reschedule: { label: 'Provider reschedule' },
    customer_reschedule: { label: 'Customer reschedule' },
    refusal: { label: 'Refusal' },
    extra_effort: { label: 'Extra effort' },
    cancellation: { label: 'Cancellation' },
    site_issue: { label: 'Site issue' },
  }),
  deviationOutcome: defineValues<DeviationOutcome>({
    complete: { label: 'Complete', tone: 'done' },
    reschedule: { label: 'Reschedule', tone: 'caution' },
    cancel: { label: 'Cancel', tone: 'critical' },
  }),
  mailStatus: defineValues<MailStatus>({
    queued: { label: 'Queued', tone: 'intake', terminal: false },
    sent: { label: 'Sent', tone: 'done', terminal: true },
    failed: { label: 'Failed', tone: 'critical', terminal: true },
  }),
  appointmentStatus: defineValues<AppointmentStatus>({
    booked: { label: 'Booked', tone: 'booked', terminal: false },
    cancelled: { label: 'Cancelled', tone: 'caution', terminal: true },
  }),

  // ---- §6.14 ----
  attentionFlag: defineValues<AttentionFlag>({
    region_unresolved: {
      label: 'Region unresolved',
      tone: 'caution',
      description: 'Open service request without a resolved region',
    },
    contact_email_missing: {
      label: 'Email missing',
      tone: 'caution',
      description: 'Open service request or lease return whose contact has no email address',
    },
    unknown_article: {
      label: 'Unknown device type',
      tone: 'caution',
      description: 'Open service request with a new item that has no matching article',
    },
    appointment_soon_not_ready: {
      label: 'Appointment soon, not ready',
      tone: 'caution',
      description:
        'Appointment booked or personalization in progress/done, and the appointment is on or before the next working day',
    },
    appointment_overdue: {
      label: 'Appointment overdue',
      tone: 'critical',
      description: 'Appointment still held, but it ended more than 24 hours ago',
    },
    escalated_stale: {
      label: 'Escalated, no reaction',
      tone: 'critical',
      description: 'Escalated, and the last communication was 7 or more days ago',
    },
    itsm_closed: {
      label: 'Closed in ITSM',
      tone: 'caution',
      description: 'Open service request whose ITSM state is "Closed Complete"',
    },
    hold_group_left: {
      label: 'Left hold group',
      tone: 'caution',
      description:
        'Hardware unavailable, but the ITSM assignment group is no longer the hold group',
    },
    retirement_passed: {
      label: 'Retirement passed',
      tone: 'caution',
      description:
        'Lease return past its retirement date that is neither replacement-ordered nor closed',
    },
    not_collected: {
      label: 'Old device not collected',
      tone: 'caution',
      description: 'Replacement ordered, and the linked service request is already deployed',
    },
  }),

  // ---- §4 (intro) ----
  trigger: defineValues<Trigger>({
    user: { label: 'User', description: 'API call by a person' },
    job: { label: 'Scheduled job', description: 'Scheduled job' },
    import: { label: 'Import', description: 'Import processing' },
    sync: { label: 'Booking sync', description: 'Booking provider sync' },
    system: { label: 'System', description: 'Consequence of another transition' },
  }),

  // ---- §4.3 ----
  assetAction: defineValues<AssetAction>({
    receive: { label: 'Receive', description: 'New asset received into hub goods in or staging' },
    place: { label: 'Place', description: 'Placed on an installation place in staging' },
    assign: { label: 'Assign', description: 'Reserved for an SR item' },
    unassign: { label: 'Unassign', description: 'Reservation removed; back to available' },
    prepare: { label: 'Prepare', description: 'Moved to goods out after order closing' },
    provide: { label: 'Provide', description: 'Handed over for delivery (in transit)' },
    return_to_hub: {
      label: 'Return to hub',
      description: 'Back to goods out after a reschedule',
    },
    release: { label: 'Release', description: 'Released from the SR back to available' },
    deploy: { label: 'Deploy', description: 'Deployed at the user' },
    register_unknown: {
      label: 'Register unknown device',
      description: 'Unknown old device registered by a technician scan',
    },
    collect: { label: 'Collect', description: 'Old device collected to a return location' },
    sync_in_use: { label: 'Sync: in use', description: 'Asset status sync import set in use' },
    sync_collected: {
      label: 'Sync: collected',
      description: 'Asset status sync import set collected',
    },
    mark_missing: { label: 'Mark missing', description: 'Not found; location kept as last known' },
    mark_found: { label: 'Mark found', description: 'Found again at the given location' },
    inventory_relocate: {
      label: 'Inventory relocation',
      description: 'Moved to the scanned location by inventory corrections',
    },
    deactivate: { label: 'Deactivate', description: 'Left the fleet by deactivation upload' },
    correct: {
      label: 'Correct status/location',
      description: 'Manual correction with a reason',
    },
  }),

  // ---- §4.10 ----
  readiness: defineValues<Readiness>({
    ready: { label: 'Ready', tone: 'transit', description: 'Provided or shipped' },
    to_pick: { label: 'To pick', tone: 'workshop', description: 'Ready for picking' },
    in_staging: { label: 'In staging', tone: 'workshop', description: 'Personalization started' },
    not_started: { label: 'Not started', tone: 'caution', description: 'Appointment booked' },
  }),

  // ---- SPEC_RESOLUTIONS #17 / #25 ----
  scanVerdict: defineValues<ScanVerdict>({
    ok: { label: 'OK', tone: 'done', description: 'Short high beep' },
    warning: { label: 'Warning', tone: 'caution', description: 'Two falling tones' },
    error: { label: 'Error', tone: 'critical', description: 'Long low buzz' },
  }),
  assetSource: defineValues<AssetSource>({
    import_new: { label: 'New-asset import' },
    import_status_sync: { label: 'Status sync import' },
    technician_scan: { label: 'Technician scan' },
    manual: { label: 'Manual' },
    seed: { label: 'Seed data' },
  }),
  scanCode: defineValues<ScanCode>(SCAN_CODES),

  transitions: {
    serviceRequest: SR_TRANSITIONS,
    leaseReturn: LEASE_TRANSITIONS,
    asset: ASSET_TRANSITIONS,
  },
  permissions: PERMISSION_KEYS.map((key) => ({ key, label: PERMISSION_LABELS[key] })),
}

// =================================================================================================
// Demo personas (SPEC §3.3)
// =================================================================================================

export interface DemoPersona {
  email: string
  displayName: string
  firstName: string
  lastName: string
  role: Role
  roleLabel: string
  description: string
  homeSiteCode: 'RIV' | 'HIL' | 'EAS' | null
  group: 'primary' | 'more_technicians'
  initials: string
}

export const PERSONAS: readonly DemoPersona[] = [
  {
    email: 'dana.dispatcher@example.com',
    displayName: 'Dana Dispatcher',
    firstName: 'Dana',
    lastName: 'Dispatcher',
    role: 'dispatcher',
    roleLabel: 'Dispatcher',
    description: 'Runs imports, comms, staging, tour planning, call-offs',
    homeSiteCode: 'RIV',
    group: 'primary',
    initials: 'DD',
  },
  {
    email: 'theo.technician@example.com',
    displayName: 'Theo Technician',
    firstName: 'Theo',
    lastName: 'Technician',
    role: 'technician',
    roleLabel: 'Technician',
    description: 'Has a tour today (Riverton calendar) with 5 stops',
    homeSiteCode: 'RIV',
    group: 'primary',
    initials: 'TT',
  },
  {
    email: 'vic.viewer@example.com',
    displayName: 'Vic Viewer',
    firstName: 'Vic',
    lastName: 'Viewer',
    role: 'viewer',
    roleLabel: 'Viewer',
    description: 'Client-side observer (Globex Fleet AG)',
    homeSiteCode: null,
    group: 'primary',
    initials: 'VV',
  },
  {
    email: 'ada.admin@example.com',
    displayName: 'Ada Admin',
    firstName: 'Ada',
    lastName: 'Admin',
    role: 'admin',
    roleLabel: 'Admin',
    description: 'Master data, users, demo reset',
    homeSiteCode: null,
    group: 'primary',
    initials: 'AA',
  },
  {
    email: 'tara.lindqvist@example.com',
    displayName: 'Tara Lindqvist',
    firstName: 'Tara',
    lastName: 'Lindqvist',
    role: 'technician',
    roleLabel: 'Technician',
    description: 'Hillford tours',
    homeSiteCode: 'HIL',
    group: 'more_technicians',
    initials: 'TL',
  },
  {
    email: 'omar.reyes@example.com',
    displayName: 'Omar Reyes',
    firstName: 'Omar',
    lastName: 'Reyes',
    role: 'technician',
    roleLabel: 'Technician',
    description: 'Eastgate + Northport + Southmere tours',
    homeSiteCode: 'EAS',
    group: 'more_technicians',
    initials: 'OR',
  },
  {
    email: 'jonas.weber@example.com',
    displayName: 'Jonas Weber',
    firstName: 'Jonas',
    lastName: 'Weber',
    role: 'technician',
    roleLabel: 'Technician',
    description: 'Westbay, Lakeside, Highmoor, Oakridge tours',
    homeSiteCode: 'EAS',
    group: 'more_technicians',
    initials: 'JW',
  },
]

// =================================================================================================
// Deviation codes (SPEC §6.13, fixed ids)
// =================================================================================================

type DeviationRow = Pick<
  DeviationCode,
  'id' | 'code' | 'label' | 'category' | 'outcome' | 'requiresComment'
>

const DEVIATION_ROWS: readonly DeviationRow[] = [
  {
    id: 1,
    code: 'DV01',
    label: 'Technician unavailable (illness, vehicle breakdown)',
    category: 'provider_reschedule',
    outcome: 'reschedule',
    requiresComment: false,
  },
  {
    id: 2,
    code: 'DV02',
    label: 'Wrong hardware provided',
    category: 'provider_reschedule',
    outcome: 'reschedule',
    requiresComment: true,
  },
  {
    id: 3,
    code: 'DV03',
    label: 'New device damaged or defective on arrival',
    category: 'provider_reschedule',
    outcome: 'reschedule',
    requiresComment: true,
  },
  {
    id: 4,
    code: 'DV04',
    label: 'User not present or unreachable',
    category: 'customer_reschedule',
    outcome: 'reschedule',
    requiresComment: false,
  },
  {
    id: 5,
    code: 'DV05',
    label: 'User requested a new date during the visit',
    category: 'customer_reschedule',
    outcome: 'reschedule',
    requiresComment: false,
  },
  {
    id: 6,
    code: 'DV06',
    label: 'User data backup not available',
    category: 'customer_reschedule',
    outcome: 'reschedule',
    requiresComment: false,
  },
  {
    id: 7,
    code: 'DV07',
    label: 'User rescheduled at least one working day ahead',
    category: 'customer_reschedule',
    outcome: 'reschedule',
    requiresComment: false,
  },
  {
    id: 8,
    code: 'DV08',
    label: 'User rescheduled at short notice (less than 24 h)',
    category: 'customer_reschedule',
    outcome: 'reschedule',
    requiresComment: false,
  },
  {
    id: 9,
    code: 'DV09',
    label: 'Site not accessible (building or room closed)',
    category: 'site_issue',
    outcome: 'reschedule',
    requiresComment: true,
  },
  {
    id: 10,
    code: 'DV10',
    label: 'User refused to hand over the old device',
    category: 'refusal',
    outcome: 'complete',
    requiresComment: true,
  },
  {
    id: 11,
    code: 'DV11',
    label: 'Old device defective — collection refused, new removal request needed',
    category: 'refusal',
    outcome: 'complete',
    requiresComment: true,
  },
  {
    id: 12,
    code: 'DV12',
    label: 'Additional user briefing required (extra effort)',
    category: 'extra_effort',
    outcome: 'complete',
    requiresComment: false,
  },
  {
    id: 13,
    code: 'DV13',
    label: 'Additional peripherals connected on site',
    category: 'extra_effort',
    outcome: 'complete',
    requiresComment: false,
  },
  {
    id: 14,
    code: 'DV14',
    label: 'Network or infrastructure issue — installation partially completed',
    category: 'site_issue',
    outcome: 'complete',
    requiresComment: true,
  },
  {
    id: 15,
    code: 'DV15',
    label: 'Order cancelled: incorrect order by client',
    category: 'cancellation',
    outcome: 'cancel',
    requiresComment: true,
  },
  {
    id: 16,
    code: 'DV16',
    label: 'Order cancelled: user refused the hardware exchange',
    category: 'cancellation',
    outcome: 'cancel',
    requiresComment: true,
  },
]

export const DEVIATION_CODES: readonly DeviationCode[] = DEVIATION_ROWS.map((row) => ({
  ...row,
  description: null,
  isActive: true,
  sortOrder: row.id,
}))

// =================================================================================================
// Helpers
// =================================================================================================

/** Looks up one value of an enum in a catalog (`ENUM_CATALOG` or a `GET /meta/enums` response). */
export function enumValue(
  catalog: EnumsResponse,
  key: keyof Omit<EnumsResponse, 'transitions' | 'permissions'>,
  value: string,
): EnumValue | undefined {
  return catalog[key].find((entry) => entry.value === value)
}
