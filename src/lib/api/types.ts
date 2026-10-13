/**
 * Hangar REST API types — copied verbatim from `_spec/hangar/API.md` (sections in the same order).
 *
 * Pure type declarations: no runtime code in this file. Request bodies that API.md writes inline
 * in endpoint tables are given named interfaces (marked "request body") next to the section they
 * belong to. Absent response values are `null`, never omitted; `?` fields are request-only.
 */

// =================================================================================================
// §1 Conventions
// =================================================================================================

// ---- §1.2 Pagination ----

/** `GET` list endpoints marked **Page** (`?page=1&perPage=25`). */
export interface Page<T> {
  data: T[]
  meta: PageMeta
}
export interface PageMeta {
  page: number
  perPage: number
  total: number
  totalPages: number
}
/** Small reference lists marked **List**: `{ data: T[] }` without `meta`. */
export interface List<T> {
  data: T[]
}

// ---- §1.4 Errors — RFC 9457 `application/problem+json` ----

/** Machine codes of `Problem.code` (API.md §1.4 table). */
export type ProblemCode =
  // 400
  | 'bad_request'
  | 'invalid_file'
  | 'encoding_unsupported'
  | 'duplicate_columns'
  | 'empty_file'
  | 'file_unreadable'
  // 401
  | 'unauthenticated'
  | 'invalid_credentials'
  // 403
  | 'forbidden'
  | 'account_inactive'
  | 'not_own_tour'
  | 'invalid_signature'
  // 404
  | 'not_found'
  | 'unknown_action'
  // 409
  | 'transition_not_allowed'
  | 'guard_failed'
  | 'version_conflict'
  | 'conflict'
  | 'inventory_already_open'
  | 'tour_exists'
  | 'undo_not_possible'
  | 'duplicate'
  // 413
  | 'too_large'
  | 'too_many_rows'
  // 415
  | 'unsupported_media_type'
  // 422
  | 'validation_error'
  | 'missing_columns'
  | 'type_not_detected'
  // 502
  | 'carrier_error'
  | 'booking_error'
  // 503
  | 'unavailable'

export interface Problem {
  /** `"https://hangar.example.com/problems/<code>"` */
  type: string
  /** Short English title. */
  title: string
  /** HTTP status. */
  status: number
  /** Human explanation. */
  detail: string | null
  /** Request path. */
  instance: string
  /** Machine code. */
  code: ProblemCode
  /** 422 only: camelCase field path → messages (`"lines.2.quantity"`). */
  errors?: Record<string, string[]>
  /** 409 `guard_failed` only (SPEC §4.1.1 guard codes). */
  guard?: { code: string; message: string }
  /** 409 `transition_not_allowed`: actions available from the current status. */
  allowedActions?: string[]
  /** 409 `version_conflict`. */
  currentVersion?: number
}

// ---- §1.5 Workflow resources ----

export interface BlockedAction {
  action: string
  guard: string
  reason: string
}
export interface BulkResult {
  action: string
  succeeded: number[]
  failed: { id: number; code: string; message: string }[]
}

// ---- §1.6 Uploads and downloads ----

export interface DownloadLink {
  /** `"{HANGAR_PUBLIC_API_URL}/files/{fileId}/download?expires=<unix>&signature=<hex>"` */
  url: string
  filename: string
  contentType: string
  sizeBytes: number
  expiresAt: ISODateTime
}

// ---- §1.7 Long-running jobs ----

export interface JobAccepted {
  jobId: number
  status: 'queued'
  importJobId?: number
  dispatchRunId?: number
}

// ---- §1.8 Scan endpoints ----

export interface ScanResult<T = unknown> {
  /** `'ok' | 'warning' | 'error'` */
  verdict: ScanVerdict
  /** SPEC tables: `'placed'`, `'not_fifo'`, `'unknown_serial'`, `'matched'`, `'duplicate'`, ... */
  code: string
  /** English, display-ready (also read by screen readers). */
  message: string
  /** Normalized input. */
  scannedValue: string
  /** True if state changed. */
  applied: boolean
  /** Affected entity, shape per endpoint. */
  entity: T | null
  /** How to revert this scan (only when applied). */
  undo: UndoLink | null
  progress: { done: number; total: number } | null
  /** Deployment: unknown device may be registered as old device. */
  canRegister: boolean
  /** Deployment: old slots that are still unverified. */
  suggestedSlots: ItemSlot[]
}
export interface UndoLink {
  method: 'POST' | 'DELETE'
  /** Relative to `/api/v1`. */
  href: string
  body: Record<string, unknown> | null
}

// =================================================================================================
// §2 Shared schemas
// =================================================================================================

export type ID = number
/** `"2026-10-13T07:00:00Z"` */
export type ISODateTime = string
/** `"2026-10-13"` (business time zone) */
export type ISODate = string
/** DESIGN.md §2.3 tone families. */
export type Tone =
  'intake' | 'outreach' | 'booked' | 'workshop' | 'transit' | 'done' | 'caution' | 'critical'

// ---- enums (values exactly as SPEC §4) ----

export type Role = 'viewer' | 'technician' | 'dispatcher' | 'admin'
export type ServiceRequestStatus =
  | 'imported'
  | 'imported_vip'
  | 'hardware_unavailable'
  | 'invited'
  | 'campus_info_sent'
  | 'reminder_1_sent'
  | 'reminder_2_sent'
  | 'escalated'
  | 'reschedule_needed'
  | 'appointment_booked'
  | 'personalization_in_progress'
  | 'personalization_done'
  | 'ready_for_picking'
  | 'shipped'
  | 'provided'
  | 'completed'
  | 'cancelled'
export type PipelineStage =
  'imported' | 'invited' | 'booked' | 'personalizing' | 'ready' | 'delivery' | 'deployed' | 'closed'
export type LeaseReturnStatus =
  | 'imported'
  | 'imported_vip'
  | 'info_sent'
  | 'reminder_1_sent'
  | 'reminder_2_sent'
  | 'escalated'
  | 'replacement_ordered'
  | 'probably_closed'
  | 'closed'
export type AssetStatus =
  | 'available'
  | 'assigned'
  | 'prepared'
  | 'provided'
  | 'in_use'
  | 'collected'
  | 'missing'
  | 'deactivated_returned'
  | 'deactivated_bought_out'
  | 'deactivated_disposed'
export type LocationType =
  'goods_in' | 'staging' | 'goods_out' | 'return' | 'in_transit' | 'in_use' | 'off_fleet'
export type DeliveryType = 'technician' | 'parcel_to_user' | 'parcel_to_pickup_point'
export type ProcurementType = 'replacement' | 'new_hire' | 'additional_device' | 'removal'
export type ItemSlot =
  | 'new_base'
  | 'new_peripheral_1'
  | 'new_peripheral_2'
  | 'old_base'
  | 'old_peripheral_1'
  | 'old_peripheral_2'
export type OsReinstallTiming = 'on_pickup' | 'on_delivery'
export type DeactivationReason = 'returned_to_lessor' | 'bought_out' | 'disposed'
export type Gender = 'female' | 'male' | 'diverse' | 'unspecified'
export type SiteKind = 'hub' | 'campus'
export type RegionRuleMatchKind = 'cost_center' | 'zip' | 'zip_prefix' | 'city'
export type ArticleCategory =
  | 'laptop'
  | 'desktop'
  | 'tablet'
  | 'docking_station'
  | 'monitor'
  | 'headset'
  | 'keyboard'
  | 'mouse'
  | 'webcam'
  | 'bag'
  | 'accessory'
export type ImportType =
  'lease_returns' | 'service_requests' | 'contacts' | 'assets_new' | 'asset_status_sync'
export type ImportJobStatus =
  'queued' | 'processing' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled'
export type InventoryStatus = 'open' | 'closed' | 'cancelled'
export type InventoryScanResult = 'matched' | 'wrong_location' | 'unknown'
export type TourStatus = 'draft' | 'planned' | 'in_progress' | 'completed' | 'cancelled'
export type TourStopOutcome = 'pending' | 'completed' | 'rescheduled' | 'cancelled'
export type CallOffOrderStatus = 'draft' | 'sent' | 'cancelled'
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type JobKind =
  | 'import'
  | 'appointments_sync'
  | 'stock_recalculate'
  | 'comms_dispatch'
  | 'regions_reapply'
  | 'demo_reset'
export type DeviationCategory =
  | 'provider_reschedule'
  | 'customer_reschedule'
  | 'refusal'
  | 'extra_effort'
  | 'cancellation'
  | 'site_issue'
export type DeviationOutcome = 'complete' | 'reschedule' | 'cancel'
export type MailStatus = 'queued' | 'sent' | 'failed'
export type AppointmentStatus = 'booked' | 'cancelled'
export type ScanVerdict = 'ok' | 'warning' | 'error'
export type Trigger = 'user' | 'job' | 'import' | 'sync' | 'system'
export type AssetSource =
  'import_new' | 'import_status_sync' | 'technician_scan' | 'manual' | 'seed'
export type AssetAction =
  | 'receive'
  | 'place'
  | 'assign'
  | 'unassign'
  | 'prepare'
  | 'provide'
  | 'return_to_hub'
  | 'release'
  | 'deploy'
  | 'register_unknown'
  | 'collect'
  | 'sync_in_use'
  | 'sync_collected'
  | 'mark_missing'
  | 'mark_found'
  | 'inventory_relocate'
  | 'deactivate'
  | 'correct'
export type AttentionFlag =
  | 'region_unresolved'
  | 'contact_email_missing'
  | 'unknown_article'
  | 'appointment_soon_not_ready'
  | 'appointment_overdue'
  | 'escalated_stale'
  | 'itsm_closed'
  | 'hold_group_left'
  | 'retirement_passed'
  | 'not_collected'
export type Readiness = 'ready' | 'to_pick' | 'in_staging' | 'not_started'

// ---- references (compact embedded objects) ----

export interface UserRef {
  id: ID
  displayName: string
  email: string
  role: Role
}
export interface SiteRef {
  id: ID
  code: string
  name: string
  kind: SiteKind
}
export interface RegionRef {
  id: ID
  code: string
  name: string
}
export interface LocationRef {
  id: ID
  code: string
  name: string
  type: LocationType
  siteId: ID | null
}
export interface ArticleRef {
  id: ID
  number: string
  name: string
  modelNumber: string
  internalDescription: string
  category: ArticleCategory
}
export interface ContactRef {
  id: ID
  userId: string
  displayName: string
  email: string | null
}
export interface DeviationCodeRef {
  id: number
  code: string
  label: string
  outcome: DeviationOutcome
}
export interface EntityRef {
  type:
    | 'service_request'
    | 'lease_return'
    | 'asset'
    | 'calloff_order'
    | 'inventory'
    | 'import_job'
    | 'tour'
    | 'contact'
  id: ID
  label: string
}
export interface Address {
  street: string | null
  zip: string | null
  city: string | null
  country: string | null
}
export interface DeliveryAddress extends Address {
  room: string | null
  building: string | null
}

export interface AssetSummary {
  id: ID
  serialNumber: string
  assetTag: string | null
  article: ArticleRef | null
  model: string | null
  status: AssetStatus
  location: LocationRef
  installationPlace: string | null
  serviceRequest: { id: ID; number: string } | null
}

// =================================================================================================
// §3 Core endpoints
// =================================================================================================

// ---- §3.1 Auth ----

/** `POST /auth/login` request body. */
export interface LoginRequest {
  email: string
  password: string
}
/** `POST /auth/persona-login` request body (demo mode; must be a demo persona). */
export interface PersonaLoginRequest {
  email: string
}
export interface LoginResponse {
  accessToken: string
  tokenType: 'Bearer'
  expiresAt: ISODateTime
  user: Me
}
export interface Persona {
  email: string
  displayName: string
  role: Role
  roleLabel: string
  /** One-line story, e.g. "Runs imports, comms, staging and tour planning". */
  description: string
  homeSite: SiteRef | null
  group: 'primary' | 'more_technicians'
  /** `"DD"` */
  initials: string
}

// ---- §3.2 GET /me ----

export interface Me {
  id: ID
  email: string
  firstName: string
  lastName: string
  displayName: string
  role: Role
  /** SPEC §3.2 keys. */
  permissions: string[]
  homeSite: SiteRef | null
  isDemoPersona: boolean
}

// ---- §3.3 Meta ----

export interface AppConfig {
  appName: 'Hangar'
  version: string
  demoMode: boolean
  /** `"Europe/Zurich"` */
  businessTimeZone: string
  /** Business date now. */
  today: ISODate
  gateways: {
    booking: 'fake' | 'real'
    carrier: 'fake' | 'real'
    mailer: 'smtp' | 'memory' | 'console'
  }
  /** Demo: `"http://localhost:8025"`. */
  mailpitUrl: string | null
  limits: {
    importMaxBytes: number
    importMaxRows: number
    deactivationMaxRows: number
    bulkMaxIds: number
    perPageMax: number
  }
}

export interface EnumValue {
  value: string
  label: string
  description: string | null
  tone: Tone | null
  order: number
  /** `serviceRequestStatus` only. */
  stage?: PipelineStage
  /** Status enums. */
  terminal?: boolean
  /** `scanCode` only (SPEC_RESOLUTIONS #25): the verdict that picks banner tone and sound. */
  verdict?: ScanVerdict
}
export interface TransitionDef {
  /** `"send_invitation"` */
  action: string
  /** `"Send booking invitation"` */
  label: string
  from: string[]
  /** `null` = computed (`send_next_mail`, resume). */
  to: string | null
  triggers: Trigger[]
  permission: string | null
  bulk: boolean
  requiresComment: boolean
  destructive: boolean
  owner: 'core' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5'
}
export interface EnumsResponse {
  serviceRequestStatus: EnumValue[]
  pipelineStage: EnumValue[]
  leaseReturnStatus: EnumValue[]
  assetStatus: EnumValue[]
  locationType: EnumValue[]
  deliveryType: EnumValue[]
  procurementType: EnumValue[]
  itemSlot: EnumValue[]
  osReinstallTiming: EnumValue[]
  deactivationReason: EnumValue[]
  gender: EnumValue[]
  role: EnumValue[]
  siteKind: EnumValue[]
  regionRuleMatchKind: EnumValue[]
  articleCategory: EnumValue[]
  importType: EnumValue[]
  importJobStatus: EnumValue[]
  inventoryStatus: EnumValue[]
  inventoryScanResult: EnumValue[]
  tourStatus: EnumValue[]
  tourStopOutcome: EnumValue[]
  callOffOrderStatus: EnumValue[]
  jobStatus: EnumValue[]
  jobKind: EnumValue[]
  deviationCategory: EnumValue[]
  deviationOutcome: EnumValue[]
  mailStatus: EnumValue[]
  appointmentStatus: EnumValue[]
  attentionFlag: EnumValue[]
  trigger: EnumValue[]
  assetAction: EnumValue[]
  readiness: EnumValue[]
  /** SPEC_RESOLUTIONS #17 */
  scanVerdict: EnumValue[]
  /** SPEC_RESOLUTIONS #17 */
  assetSource: EnumValue[]
  /** SPEC_RESOLUTIONS #25: every scan result code with its verdict. */
  scanCode: EnumValue[]
  transitions: {
    serviceRequest: TransitionDef[]
    leaseReturn: TransitionDef[]
    asset: TransitionDef[]
  }
  permissions: { key: string; label: string }[]
}

// ---- §3.4 Reference lists (core) ----

export interface Site {
  id: ID
  code: string
  name: string
  kind: SiteKind
  parentSiteId: ID | null
  address: Address
  isActive: boolean
  sortOrder: number
  locations: LocationRef[]
}
export interface Region {
  id: ID
  code: string
  name: string
  supplyingSite: SiteRef
  defaultDeliveryType: DeliveryType
  bookingDestinationId: string | null
  bookingServiceId: string | null
  pickupPoint: {
    name: string
    street: string | null
    zip: string | null
    city: string | null
  } | null
  isActive: boolean
  sortOrder: number
  ruleCount: number
  /** SPEC_RESOLUTIONS #22 (region list item). */
  openServiceRequests: number
}
export interface StockLocation extends LocationRef {
  isActive: boolean
  sortOrder: number
  site: SiteRef | null
}
export interface UserSummary {
  id: ID
  email: string
  displayName: string
  firstName: string
  lastName: string
  role: Role
  homeSite: SiteRef | null
  isActive: boolean
  lastLoginAt: ISODateTime | null
  /** SPEC_RESOLUTIONS #22 */
  isDemoPersona: boolean
}
export interface DeviationCode {
  id: number
  code: string
  label: string
  description: string | null
  category: DeviationCategory
  outcome: DeviationOutcome
  requiresComment: boolean
  isActive: boolean
  sortOrder: number
}

// ---- §3.5 GET /search ----

export type SearchKind =
  'service_request' | 'lease_return' | 'asset' | 'contact' | 'installation_place'
export interface SearchHit {
  kind: SearchKind
  /** `null` for `installation_place`. */
  id: ID | null
  /** `"SR0012345"`, `"GX204811 · Aero 14 G3 Laptop"`, `"Mia Turner"` */
  title: string
  /** `"Appointment booked · Westbay · Mia Turner"` */
  subtitle: string | null
  status: string | null
  tone: Tone | null
  /** Frontend location, e.g. `"/service-requests?sr=42"`. */
  href: string
  exact: boolean
}
export interface SearchResponse {
  query: string
  exact: SearchHit | null
  groups: { kind: SearchKind; label: string; hits: SearchHit[] }[]
}

// ---- §3.6 Saved views ----

export interface SavedViewCreate {
  route: string
  name: string
  search: Record<string, unknown>
  isShared?: boolean
  sortOrder?: number
}
export interface SavedView extends Required<SavedViewCreate> {
  id: ID
  owner: UserRef
  isOwn: boolean
  createdAt: ISODateTime
}

// ---- §3.8 Generic workflow action endpoints ----

/** Fields every workflow action body accepts (`POST /<resource>/{id}/actions/{action}`). */
export interface ActionBodyBase {
  comment?: string | null
  version?: number
}
/** `POST /<resource>/bulk/{action}` request body: `{ ids (1–200), comment?, ...actionFields }`. */
export interface BulkActionBody {
  ids: ID[]
  comment?: string | null
}
/** Bulk body plus the action's own fields (same values for all ids). */
export type BulkActionRequest<TFields extends object = object> = BulkActionBody & TFields

/** `pause_communication` (SR and lease return) request body. */
export interface PauseCommunicationBody extends ActionBodyBase {
  reason: string
  resumeDate?: ISODate | null
}
/** SR `cancel`, `complete_manually`, `close_without_label`; lease `close` — comment required. */
export interface CommentRequiredActionBody extends ActionBodyBase {
  comment: string
}
/** SR `cancel` request body. */
export type CancelBody = CommentRequiredActionBody
/** SR `complete_manually` request body. */
export type CompleteManuallyBody = CommentRequiredActionBody
/** SR `close_without_label` request body. */
export type CloseWithoutLabelBody = CommentRequiredActionBody
/** SR `book_appointment` request body. */
export interface BookAppointmentBody extends ActionBodyBase {
  calendarId: ID
  startAt: ISODateTime
  /** Default start + 60 min. */
  endAt?: ISODateTime
}
/** SR `request_reschedule` request body. */
export interface RequestRescheduleBody extends ActionBodyBase {
  reason: string
  /** Default `true`. */
  notifyUser?: boolean
  /** Default `true`. */
  cancelAtProvider?: boolean
}
/** SR `complete_deployment` request body. */
export interface CompleteDeploymentBody extends ActionBodyBase {
  /** Printed on the protocol. */
  recipientName: string
  /** Must be true if any new item was verified. */
  handoverConfirmed: boolean
  /** Outcome must be `'complete'`. */
  deviationCodeId?: number | null
  /** Required when the code requires it. */
  deviationComment?: string | null
  /** Default `true`. */
  sendProtocol?: boolean
  /** Default contact email. */
  protocolEmail?: string | null
}
/** SR `reschedule_on_site` and `cancel_on_site` request body. */
export interface DeviationActionBody extends ActionBodyBase {
  deviationCodeId: number
  deviationComment?: string | null
}
/** Lease `link_service_request` request body. */
export interface LinkServiceRequestBody extends ActionBodyBase {
  serviceRequestNumber: string
}
/** Lease `close` request body. */
export type CloseBody = CommentRequiredActionBody
/** Asset `mark_missing` request body. */
export interface MarkMissingBody extends ActionBodyBase {
  reason?: string
}
/** Asset `mark_found` request body. */
export interface MarkFoundBody extends ActionBodyBase {
  locationId: ID
  installationPlace?: string | null
}
/** Asset `correct` request body (bulk: same values for all ids). */
export interface CorrectAssetBody extends ActionBodyBase {
  status?: AssetStatus
  locationId?: ID
  installationPlace?: string | null
  reason: string
}
/** Optional-comment body: tour actions, call-off cancel, inventory cancel. */
export interface CommentBody {
  comment?: string
}

// ---- §3.9 GET /jobs/{id} ----

export interface BackgroundJob {
  id: ID
  kind: JobKind
  status: JobStatus
  progress: { processed: number; total: number | null; percent: number | null }
  message: string | null
  error: string | null
  cancelRequested: boolean
  entity: EntityRef | null
  createdBy: UserRef | null
  createdAt: ISODateTime
  startedAt: ISODateTime | null
  finishedAt: ISODateTime | null
  result:
    | { kind: 'import'; importJobId: ID; status: ImportJobStatus; counts: ImportCounts }
    | {
        kind: 'appointments_sync'
        calendars: number
        created: number
        updated: number
        cancelled: number
        matched: number
        unmatched: number
        transitions: number
      }
    | {
        kind: 'stock_recalculate'
        articles: number
        sites: number
        calculatedAt: ISODateTime
        durationMs: number
      }
    | {
        kind: 'comms_dispatch'
        dispatchRunId: ID
        counts: Record<string, number>
        skipped: Record<string, number>
        errorCount: number
      }
    | {
        kind: 'regions_reapply'
        serviceRequestsChanged: number
        leaseReturnsChanged: number
        unresolved: number
      }
    | { kind: 'demo_reset'; seededAt: ISODateTime }
    | null
}
/** Non-null `BackgroundJob.result` variants, discriminated by `kind`. */
export type BackgroundJobResult = NonNullable<BackgroundJob['result']>

// ---- §3.10 Demo and health ----

export interface HealthResponse {
  status: 'ok'
}
export interface ReadyResponse {
  status: 'ok'
  db: 'ok'
  queue: 'ok'
}

// =================================================================================================
// §4 H1 — Requests & Comms
// =================================================================================================

// ---- §4.1 GET /service-requests ----

export interface ServiceRequestListItem {
  id: ID
  number: string
  taskNumber: string | null
  status: ServiceRequestStatus
  stage: PipelineStage
  statusChangedAt: ISODateTime
  contact: ContactRef
  region: RegionRef | null
  supplyingSite: SiteRef | null
  /** Effective (override ?? resolved). */
  deliveryType: DeliveryType | null
  isCampus: boolean
  isVip: boolean
  procurementType: ProcurementType | null
  /** Requested device types in slot order. */
  newItemTypes: string[]
  appointmentStartAt: ISODateTime | null
  appointmentEndAt: ISODateTime | null
  /** Denormalized from H4. */
  appointmentCalendarId: ID | null
  /** Denormalized from H4. */
  appointmentCalendarName: string | null
  communicationDate: ISODate | null
  communicationPaused: boolean
  communicationResumeDate: ISODate | null
  editor: UserRef | null
  importedAt: ISODateTime
  attention: AttentionFlag[]
  availableActions: string[]
}

// ---- §4.2 GET /service-requests/{id} ----

export interface ServiceRequestDetail extends ServiceRequestListItem {
  version: number
  itsmState: string | null
  assignmentGroup: string | null
  openedAt: ISODateTime | null
  catalogItem: string | null
  shortDescription: string | null
  costCenter: string | null
  scopeOfDelivery: string | null
  clientComponent: string | null
  requestedSoftware: string[]
  addedSoftware: string[]
  installedSoftware: string[]
  note: string | null
  onsiteContactPhone: string | null
  deliveryAddress: DeliveryAddress
  regionRule: { id: ID; matchKind: RegionRuleMatchKind; pattern: string } | null
  regionOverridden: boolean
  resolvedDeliveryType: DeliveryType | null
  deliveryTypeOverride: DeliveryType | null
  resumeStatus: ServiceRequestStatus | null
  communicationPauseReason: string | null
  hardwareUnavailableNotifiedAt: ISODateTime | null
  claimedAt: ISODateTime | null
  withoutAssetPrep: boolean
  osReinstall: OsReinstallTiming | null
  deviation: { code: DeviationCodeRef; comment: string | null } | null
  items: ServiceRequestItem[]
  linkedLeaseReturns: { id: ID; assetTag: string; status: LeaseReturnStatus }[]
  milestones: {
    personalizedAt: ISODateTime | null
    orderClosedAt: ISODateTime | null
    providedAt: ISODateTime | null
    shippedAt: ISODateTime | null
    completedAt: ISODateTime | null
    cancelledAt: ISODateTime | null
  }
  /** Built from region ids; `null` if unresolved or campus. */
  bookingLink: string | null
  protocolAvailable: boolean
  lastImportedAt: ISODateTime
  lastImportJobId: ID | null
  blockedActions: BlockedAction[]
}
export interface ServiceRequestItem {
  id: ID
  slot: ItemSlot
  direction: 'deliver' | 'collect'
  requestedType: string | null
  article: ArticleRef | null
  expectedAssetTag: string | null
  asset: AssetSummary | null
  assignedAt: ISODateTime | null
  assignedBy: UserRef | null
  packedAt: ISODateTime | null
  packedBy: UserRef | null
  verifiedAt: ISODateTime | null
  verifiedBy: UserRef | null
  verifiedSerial: string | null
}

// ---- §4.3 PATCH /service-requests/{id} ----

export interface ServiceRequestPatch {
  version?: number
  /** Triggers region re-resolution unless overridden. */
  deliveryAddress?: Partial<DeliveryAddress>
  onsiteContactPhone?: string | null
  note?: string | null
  /** Triggers re-resolution. */
  costCenter?: string | null
  /** Set = manual override; `null` = clear override + re-resolve. */
  regionId?: ID | null
  deliveryTypeOverride?: DeliveryType | null
}

// ---- §4.4 Service request history and export ----

/** `id` = `"<kind>:<source id>"` (unique within the list). */
export type HistoryEntry =
  | {
      kind: 'transition'
      id: string
      occurredAt: ISODateTime
      actor: UserRef | null
      trigger: Trigger
      action: string
      actionLabel: string
      fromStatus: string | null
      toStatus: string
      comment: string | null
      payload: Record<string, unknown> | null
    }
  | {
      kind: 'mail'
      id: string
      occurredAt: ISODateTime
      actor: UserRef | null
      trigger: Trigger
      mailLogId: ID
      templateId: string
      subject: string | null
      to: string[]
      status: MailStatus
    }
  | {
      kind: 'asset_movement'
      id: string
      occurredAt: ISODateTime
      actor: UserRef | null
      trigger: Trigger
      movementId: ID
      asset: { id: ID; serialNumber: string; assetTag: string | null }
      action: AssetAction
      fromStatus: AssetStatus | null
      toStatus: AssetStatus
      fromLocation: LocationRef | null
      toLocation: LocationRef
      reason: string | null
    }
  /** Lease returns only. */
  | {
      kind: 'comment'
      id: string
      occurredAt: ISODateTime
      actor: UserRef | null
      trigger: 'user'
      body: string
    }

// ---- §4.5 Lease returns ----

export interface LeaseReturnListItem {
  id: ID
  assetTag: string
  serialNumber: string | null
  model: string | null
  modelCategory: string | null
  retirementDate: ISODate
  /** Negative when passed. */
  daysUntilRetirement: number
  contact: ContactRef | null
  userId: string
  status: LeaseReturnStatus
  statusChangedAt: ISODateTime
  isVip: boolean
  isCampus: boolean
  communicationDate: ISODate | null
  communicationPaused: boolean
  communicationResumeDate: ISODate | null
  serviceRequest: { id: ID; number: string; status: ServiceRequestStatus } | null
  commentCount: number
  attention: AttentionFlag[]
  availableActions: string[]
}
export interface LeaseReturnDetail extends LeaseReturnListItem {
  version: number
  checkedInAt: ISODateTime | null
  installStatus: string | null
  ciName: string | null
  costCenter: string | null
  communicationPauseReason: string | null
  infoSentAt: ISODateTime | null
  /** camelCase of `reminder_1_sent_at`. */
  reminder1SentAt: ISODateTime | null
  /** camelCase of `reminder_2_sent_at`. */
  reminder2SentAt: ISODateTime | null
  escalationSentAt: ISODateTime | null
  escalationEmail: string | null
  linkedAt: ISODateTime | null
  closedAt: ISODateTime | null
  closeReason: string | null
  importedAt: ISODateTime
  lastSeenAt: ISODateTime
  /** Asset with the same tag, if known. */
  asset: AssetSummary | null
  blockedActions: BlockedAction[]
}
export interface LeaseReturnComment {
  id: ID
  body: string
  author: UserRef
  createdAt: ISODateTime
}
/** `PATCH /lease-returns/{id}` request body. */
export interface LeaseReturnPatch {
  version?: number
  escalationEmail?: string | null
}
/** `POST /lease-returns/{id}/comments` request body. */
export interface LeaseReturnCommentCreate {
  /** 1–2000 characters. */
  body: string
}

// ---- §4.6 Contacts ----

export interface ContactListItem {
  id: ID
  userId: string
  displayName: string
  email: string | null
  department: string | null
  city: string | null
  isVip: boolean
  openServiceRequests: number
  openLeaseReturns: number
}
export interface ContactDetail extends ContactListItem {
  gender: Gender
  firstName: string | null
  lastName: string
  phone: string | null
  mobile: string | null
  address: {
    street: string | null
    zip: string | null
    city: string | null
    building: string | null
    room: string | null
  }
  isActive: boolean
  vip: { vipType: string; title: string | null } | null
  serviceRequests: { id: ID; number: string; status: ServiceRequestStatus }[]
  leaseReturns: { id: ID; assetTag: string; status: LeaseReturnStatus }[]
}
export interface ContactPatch {
  email?: string | null
  phone?: string | null
  mobile?: string | null
  department?: string | null
  gender?: Gender
  street?: string | null
  zip?: string | null
  city?: string | null
  building?: string | null
  room?: string | null
}

// ---- §4.7 GET /pipeline/summary ----

export interface PipelineSummary {
  generatedAt: ISODateTime
  /** All 8 stages, statuses in enum order; `deployed` and `closed` count only the last 14 days. */
  stages: {
    stage: PipelineStage
    label: string
    count: number
    statuses: {
      status: ServiceRequestStatus
      label: string
      tone: Tone
      count: number
      oldestStatusChangedAt: ISODateTime | null
      attentionCount: number
    }[]
  }[]
  totals: {
    open: number
    vipOpen: number
    needsAttention: number
    completedLast7Days: number
    cancelledLast7Days: number
    appointmentsToday: number
  }
}

// ---- §4.8 Communications ----

export interface MailLogEntry {
  id: ID
  notificationId: string
  templateId: string
  templateName: string
  status: MailStatus
  to: string[]
  cc: string[]
  subject: string | null
  entity: EntityRef | null
  trigger: Trigger
  triggeredBy: UserRef | null
  queuedAt: ISODateTime
  sentAt: ISODateTime | null
  error: string | null
  attachmentCount: number
}
export interface MailLogDetail extends MailLogEntry {
  /** Rendered in a sandboxed `iframe srcdoc`. */
  bodyHtml: string | null
  bodyText: string | null
  attachments: {
    fileId: ID
    filename: string
    contentType: string
    sizeBytes: number
    download: DownloadLink
  }[]
}

/** `PUT /dispatch-settings` request body (all fields; ranges per SPEC §5.2). */
export interface DispatchSettingsInput {
  leaseMailsEnabled: boolean
  leaseInfoDaysBeforeRetirement: number
  leaseReminder1AfterDays: number
  leaseReminder2AfterDays: number
  leaseEscalationAfterDays: number
  srMailsEnabled: boolean
  srInviteAfterImportDays: number
  srReminder1AfterDays: number
  srReminder2AfterDays: number
  srEscalationAfterDays: number
  hardwareUnavailableMailEnabled: boolean
  rescheduleMailEnabled: boolean
  maxMailsPerRun: number
}
export interface DispatchSettings extends DispatchSettingsInput {
  updatedAt: ISODateTime
  updatedBy: UserRef | null
  /** Next 07:00 business time. */
  nextScheduledRunAt: ISODateTime
}

/** `POST /comms/dispatch-runs` request body. */
export interface DispatchRunCreate {
  dryRun: boolean
}
export interface DispatchRun {
  id: ID
  trigger: Trigger
  dryRun: boolean
  status: JobStatus
  startedAt: ISODateTime
  finishedAt: ISODateTime | null
  /** Template id → mails. */
  counts: Record<string, number>
  /** Guard/skip code → entities. */
  skipped: Record<string, number>
  errors: { entityType: string; entityId: ID; label: string; action: string; message: string }[]
  planned:
    | {
        entityType: 'service_request' | 'lease_return'
        entityId: ID
        label: string
        action: string
        templateId: string
        to: string[]
      }[]
    | null
  triggeredBy: UserRef | null
  jobId: ID | null
}

export interface NotificationTemplateInfo {
  id: string
  name: string
  owner: 'h1' | 'h2' | 'h3' | 'h4' | 'h5'
  description: string
  trigger: string
  recipients: string
  subjectTemplate: string
  sentLast7Days: number
}
/** `GET /notification-templates/{templateId}/preview` response (never sends). */
export interface NotificationTemplatePreview {
  subject: string
  html: string
  text: string
}

// =================================================================================================
// §5 H2 — Import & Master data
// =================================================================================================

// ---- §5.1 Imports ----

/** `POST /imports` form field `options` (JSON string). */
export interface ImportOptions {
  /** Default `false`. */
  dryRun?: boolean
  /** Required for `assets_new` (hub `goods_in` or `staging` location). */
  targetLocationId?: ID
  /** `lease_returns` only, default `false`. */
  markMissingAsProbablyClosed?: boolean
}
export interface ImportDetection {
  detectedType: ImportType | null
  /** `null` for xlsx. */
  delimiter: ',' | ';' | null
  /** As in file. */
  headers: string[]
  normalizedHeaders: string[]
  /** Required columns of `detectedType` not present. */
  missingColumns: string[]
  /** Ignored columns. */
  extraColumns: string[]
  /** Data rows. */
  rowCount: number
  /** First 5 rows keyed by normalized header. */
  preview: Record<string, string | null>[]
  /** File-level problems (encoding etc.). */
  problems: { code: string; message: string }[]
}
export interface ImportCounts {
  total: number | null
  processed: number
  created: number
  updated: number
  unchanged: number
  skipped: number
  errors: number
  warnings: number
}
export interface ImportJobSummary {
  id: ID
  jobId: ID
  type: ImportType
  typeDetected: boolean
  status: ImportJobStatus
  originalFilename: string
  dryRun: boolean
  counts: ImportCounts
  progressPercent: number | null
  createdBy: UserRef
  createdAt: ISODateTime
  startedAt: ISODateTime | null
  finishedAt: ISODateTime | null
  /** `['cancel']` while queued/processing and permitted. */
  availableActions: string[]
}
export interface ImportJobDetail extends ImportJobSummary {
  options: ImportOptions & { targetLocation: LocationRef | null }
  postProcess: {
    leaseReturnsLinked: number
    hardwareHold: number
    cancelledByItsm: number
    probablyClosed: number
    reopened: number
    contactsCreated: number
    contactsUpdated: number
  }
  /** E.g. `extra_columns`. */
  jobLevelWarnings: { code: string; message: string }[]
  hasErrorReport: boolean
  topErrorCodes: { code: string; severity: 'error' | 'warning'; count: number }[]
}
export interface ImportRowIssue {
  id: ID
  rowNumber: number
  severity: 'error' | 'warning'
  columnName: string | null
  code: string
  message: string
  rawValue: string | null
  businessKey: string | null
}
export interface ImportTemplate {
  type: ImportType
  label: string
  description: string
  signatureHeaders: string[]
  upsertKey: string
  columns: {
    name: string
    required: boolean
    format: string
    description: string
    example: string | null
  }[]
  packedFields: {
    column: string
    keys: { key: string; required: boolean; description: string }[]
  }[]
  options: { name: keyof ImportOptions; required: boolean; description: string }[]
}
/** `POST /imports/generate-sample` request body (demo mode). */
export interface ImportGenerateSampleBody {
  type: ImportType
  /** 1–500. */
  rows: number
  withErrors: boolean
}

// ---- §5.2 Articles ----

export interface ArticleInput {
  number: string
  category: ArticleCategory
  name: string
  modelNumber: string
  manufacturer: string
  externalPartNumber: string | null
  internalDescription: string
  weightKg: number
}
export interface Article extends ArticleInput {
  id: ID
  isActive: boolean
  assetCount: number
  openDemand: number
}
export interface ArticleSiteSetting {
  site: SiteRef
  bufferQty: number
  minQty: number | null
  maxQty: number | null
  stockQty: number
  demandQty: number
  calculatedAt: ISODateTime | null
  lastOrderDate: ISODate | null
  lastOrderedQty: number | null
}
export interface ArticleDetail extends Article {
  siteSettings: ArticleSiteSetting[]
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
/** `PATCH /articles/{id}/site-settings/{siteId}` request body. */
export interface ArticleSiteSettingPatch {
  minQty: number | null
  maxQty: number | null
}

// ---- §5.3 Regions and region rules ----

export interface RegionPatch {
  name?: string
  supplyingSiteId?: ID
  defaultDeliveryType?: DeliveryType
  bookingDestinationId?: string | null
  bookingServiceId?: string | null
  pickupPoint?: {
    name: string
    street: string | null
    zip: string | null
    city: string | null
  } | null
  isActive?: boolean
  sortOrder?: number
}
export interface RegionDetail extends Region {
  rules: RegionRule[]
  openServiceRequests: number
  bookingLinkExample: string | null
}
export interface RegionRuleInput {
  regionId: ID
  matchKind: RegionRuleMatchKind
  pattern: string
  procurementType: ProcurementType | null
  deliveryType: DeliveryType | null
  isCampus: boolean
  priority: number
  isActive: boolean
  note: string | null
}
export interface RegionRule extends RegionRuleInput {
  id: ID
  normalizedPattern: string
  region: RegionRef
  /** SRs currently resolved by this rule. */
  matchCount: number
}
/** `POST /region-rules/test` request body. */
export interface RegionRuleTestBody {
  zip?: string
  city?: string
  costCenter?: string
  procurementType?: ProcurementType
}
export interface RegionResolutionResult {
  resolved: boolean
  region: RegionRef | null
  rule: RegionRule | null
  deliveryType: DeliveryType | null
  isCampus: boolean
  supplyingSite: SiteRef | null
  normalizedInput: { zip: string | null; city: string | null; costCenter: string | null }
  /** All matching rules in rank order. */
  candidates: { rule: RegionRule; rank: number }[]
}

// ---- §5.4 VIP list ----

export interface VipEntryInput {
  userId: string
  firstName: string | null
  lastName: string
  vipType: string
  title: string | null
  note: string | null
}
export interface VipEntry extends VipEntryInput {
  id: ID
  contact: ContactRef | null
  openServiceRequests: number
  openLeaseReturns: number
  createdAt: ISODateTime
}

// ---- §5.5 Users administration ----

export interface UserCreate {
  email: string
  firstName: string
  lastName: string
  role: Role
  homeSiteId: ID | null
  password: string
}
/** `PATCH /users/{id}` request body. */
export interface UserPatch {
  firstName?: string
  lastName?: string
  role?: Role
  homeSiteId?: ID | null
}
/** `POST /users/{id}/actions/reset_password` request body. */
export interface ResetPasswordBody {
  /** At least 8 characters. */
  newPassword: string
}

// =================================================================================================
// §6 H3 — Staging & Fulfilment
// =================================================================================================

// ---- §6.1 Installation place scan station ----

/** `POST /scan/installation-place` request body. */
export interface InstallationPlaceScanBody {
  siteId: ID
  serial: string
  place: string
}
/** `POST /scan/installation-place/undo` request body. */
export interface InstallationPlaceUndoBody {
  movementId: ID
}
/** Only places with ≥ 1 asset; `q` = place prefix. */
export interface InstallationPlaceOccupancy {
  place: string
  assets: AssetSummary[]
}

// ---- §6.2 Personalization ----

export interface PersonalizationQueueItem extends ServiceRequestListItem {
  items: ServiceRequestItem[]
  /** New slots only. */
  stockHints: {
    slot: ItemSlot
    article: ArticleRef | null
    availableCount: number
    suggested: AssetSummary | null
  }[]
  allNewItemsAssigned: boolean
}
export interface AssetCandidates {
  slot: ItemSlot
  article: ArticleRef | null
  site: SiteRef
  suggestedAssetId: ID | null
  /** FIFO order, max 50. */
  data: {
    asset: AssetSummary
    checkedInAt: ISODateTime | null
    ageDays: number | null
    fifoRank: number
  }[]
}
export interface SoftwareChecklist {
  required: string[]
  installed: string[]
  added: string[]
  missing: string[]
  complete: boolean
}
/** `POST /service-requests/{id}/items/{slot}/assignment` request body. */
export interface AssignmentScanBody {
  serial: string
}
/** `PATCH /service-requests/{id}/staging` request body. */
export interface StagingPatch {
  osReinstall: OsReinstallTiming | null
  version?: number
}
/** `PUT /service-requests/{id}/software-checklist` request body. */
export interface SoftwareChecklistPut {
  installedSoftware: string[]
  addedSoftware: string[]
}

// ---- §6.3 Order closing ----

export interface OrderClosingQueueItem extends ServiceRequestListItem {
  items: ServiceRequestItem[]
  checklist: SoftwareChecklist
  osReinstall: OsReinstallTiming | null
}

// ---- §6.4 Picking for technicians ----

export interface TechnicianPicking {
  date: ISODate
  site: SiteRef
  groups: {
    /** From the SR's denormalized `appointment_calendar_id`/`name`. */
    calendar: { id: ID | null; name: string | null }
    /** Ordered by appointment. */
    serviceRequests: (ServiceRequestListItem & { items: ServiceRequestItem[]; picked: boolean })[]
  }[]
  totals: { toPick: number; picked: number }
}

// ---- §6.5 Parcel shipping ----

/** `POST /scan/parcel` request body. */
export interface ParcelScanBody {
  serviceRequestId: ID
  serial: string
}
export interface ParcelPickingItem extends ServiceRequestListItem {
  items: ServiceRequestItem[]
  allPacked: boolean
  hasOldItems: boolean
  shipTo: {
    kind: 'user' | 'pickup_point'
    recipientName: string
    name2: string | null
    address: Address
  }
}

// ---- §6.6 Shipments ----

/** `POST /service-requests/{id}/shipments` request body. */
export interface ShipmentCreate {
  /** Default `true`. */
  includeReturnLabel?: boolean
  /** Default `false`. */
  combinedParcel?: boolean
  /** Default `true`. */
  sendConfirmation?: boolean
  version?: number
}
export interface Shipment {
  id: ID
  serviceRequest: { id: ID; number: string }
  carrierShipmentId: string
  parcelCount: number
  trackingUrls: string[]
  returnTrackingUrls: string[]
  includeReturnLabel: boolean
  combinedParcel: boolean
  confirmationMailSent: boolean
  recipientName: string
  deliveryAddress: Address
  createdBy: UserRef
  createdAt: ISODateTime
}
export interface ShipmentCreated {
  shipment: Shipment
  serviceRequest: ServiceRequestDetail
  label: DownloadLink
  /** E.g. `'no_return_items'`. */
  warnings: string[]
}

// =================================================================================================
// §7 H4 — Field service
// =================================================================================================

// ---- §7.1 Booking calendars and appointments ----

export interface BookingCalendar {
  id: ID
  externalId: string
  name: string
  region: RegionRef | null
  serviceIds: string[]
  calendarType: string | null
  isEnabled: boolean
  syncedAt: ISODateTime | null
  upcomingAppointments: number
}
/** `PATCH /booking-calendars/{id}` request body. */
export interface BookingCalendarPatch {
  name?: string
  regionId?: ID | null
  isEnabled?: boolean
}
export interface Appointment {
  id: ID
  externalId: string
  calendar: { id: ID; name: string }
  serviceRequest: { id: ID; number: string; status: ServiceRequestStatus } | null
  reference: string | null
  status: AppointmentStatus
  startAt: ISODateTime
  endAt: ISODateTime
  title: string | null
  contactName: string | null
  contactEmail: string | null
  street: string | null
  town: string | null
  notes: string | null
  bookedAt: ISODateTime | null
  source: 'sync' | 'manual'
  isCurrent: boolean
}
/** `POST /appointments/{id}/link` request body. */
export interface AppointmentLinkBody {
  serviceRequestNumber: string
}
export interface SyncState {
  running: boolean
  lastJobId: ID | null
  lastIncrementalSyncAt: ISODateTime | null
  lastFullSyncAt: ISODateTime | null
  lastResult: {
    calendars: number
    created: number
    updated: number
    cancelled: number
    matched: number
    unmatched: number
    transitions: number
  } | null
  nextScheduledAt: ISODateTime
}

// ---- §7.2 Tours ----

/** Tour actions listed in `TourSummary.availableActions`. */
export type TourAction = 'start' | 'finish' | 'cancel' | 'assign_technician' | 'unassign_technician'

export interface TourCreate {
  calendarId: ID
  tourDate: ISODate
  technicianId?: ID | null
  serviceRequestIds: ID[]
  notes?: string | null
}
export interface TourSummary {
  id: ID
  calendar: { id: ID; name: string; region: RegionRef | null }
  tourDate: ISODate
  technician: UserRef | null
  status: TourStatus
  stopCount: number
  pendingCount: number
  completedCount: number
  rescheduledCount: number
  cancelledCount: number
  firstAppointmentAt: ISODateTime | null
  lastAppointmentAt: ISODateTime | null
  readiness: Record<Readiness, number>
  /** `'start' | 'finish' | 'cancel' | 'assign_technician' | 'unassign_technician'` */
  availableActions: string[]
}
export interface TourStop {
  id: ID
  position: number
  outcome: TourStopOutcome
  outcomeAt: ISODateTime | null
  readiness: Readiness
  serviceRequest: {
    id: ID
    number: string
    status: ServiceRequestStatus
    deliveryType: DeliveryType | null
    isCampus: boolean
    isVip: boolean
    contact: ContactRef & { phone: string | null; mobile: string | null }
    onsiteContactPhone: string | null
    deliveryAddress: DeliveryAddress
    appointmentStartAt: ISODateTime | null
    appointmentEndAt: ISODateTime | null
    /** `label` = article name or requested type. */
    newItems: { slot: ItemSlot; label: string; verified: boolean }[]
    /** `label` = expected asset tag. */
    oldItems: { slot: ItemSlot; label: string; verified: boolean }[]
  }
}
export interface TourDetail extends TourSummary {
  notes: string | null
  startedAt: ISODateTime | null
  finishedAt: ISODateTime | null
  stops: TourStop[]
  /** Non-blocking: `technician_has_other_tour`, `stops_not_ready`, `appointment_outside_tour_date`. */
  warnings: string[]
  version: number
}
export interface TourCandidates {
  calendar: { id: ID; name: string; region: RegionRef | null }
  date: ISODate
  tour: TourSummary | null
  /** Ordered by appointment. */
  candidates: {
    serviceRequest: ServiceRequestListItem
    readiness: Readiness
    inTourId: ID | null
  }[]
}
export interface TourPlannerOverview {
  days: ISODate[]
  rows: {
    calendar: { id: ID; name: string; region: RegionRef | null }
    cells: {
      date: ISODate
      appointmentCount: number
      plannedCount: number
      tour: { id: ID; status: TourStatus; technician: UserRef | null } | null
    }[]
  }[]
  technicians: {
    technician: UserRef
    days: { date: ISODate; tourCount: number; stopCount: number }[]
  }[]
}
/** `PATCH /tours/{id}` request body (technician change = `assign_technician`/`unassign_technician`). */
export interface TourPatch {
  technicianId?: ID | null
  notes?: string | null
  version?: number
}
/** `PUT /tours/{id}/stops` request body: complete ordered list of **pending** stops. */
export interface TourStopsPut {
  serviceRequestIds: ID[]
}

// ---- §7.3 Deployment ----

/** `POST /scan/deployment` request body. */
export interface DeploymentScanBody {
  serviceRequestId: ID
  serial: string
}
/** `POST /service-requests/{id}/items/{slot}/register-unknown` request body. */
export interface RegisterUnknownBody {
  serial: string
  assetTag?: string | null
  model?: string | null
}
/** `POST /service-requests/{id}/protocol/send` request body. */
export interface ProtocolSendBody {
  email?: string | null
}
/** `POST /service-requests/{id}/protocol/send` response (`202`). */
export interface ProtocolSendResponse {
  notificationId: string
}
export interface DeploymentView {
  tour: TourSummary
  stop: TourStop
  /** Includes items + availableActions (`complete_deployment`, `reschedule_on_site`, `cancel_on_site`, `request_reschedule`). */
  serviceRequest: ServiceRequestDetail
  contact: ContactDetail
  workInstructions: {
    procurementType: ProcurementType | null
    scopeOfDelivery: string | null
    clientComponent: string | null
    osReinstall: OsReinstallTiming | null
    withoutAssetPrep: boolean
    software: string[]
    note: string | null
    onsiteContactPhone: string | null
    deliveryAddress: DeliveryAddress
    isCampus: boolean
  }
  /** Active codes; UI filters by outcome per action. */
  deviationCodes: DeviationCode[]
  progress: { newVerified: number; newTotal: number; oldVerified: number; oldTotal: number }
}

// =================================================================================================
// §8 H5 — Stock, Inventory & Dashboard
// =================================================================================================

// ---- §8.1 Stock matrix ----

export interface StockCell {
  siteId: ID
  goodsIn: number
  staging: number
  goodsOut: number
  stock: number
  demand: number
  buffer: number
  /** `max(0, demand + buffer − stock)` (SPEC_RESOLUTIONS #18) */
  orderQty: number
  minQty: number | null
  maxQty: number | null
  belowMin: boolean
  aboveMax: boolean
  lastOrderDate: ISODate | null
  lastOrderedQty: number | null
}
export interface StockMatrix {
  calculatedAt: ISODateTime | null
  sites: SiteRef[]
  rows: {
    article: ArticleRef & { isActive: boolean }
    cells: StockCell[]
    totals: { stock: number; demand: number; orderQty: number }
  }[]
  meta: {
    unmatchedDemand: { requestedType: string; siteId: ID | null; count: number }[]
    unresolvedDemand: number
    recalculating: boolean
  }
}
/** `PATCH /stock/buffers` request body. */
export interface StockBuffersPatch {
  siteId: ID
  /** `bufferQty` ≥ 0. */
  buffers: { articleId: ID; bufferQty: number }[]
}
/** `PATCH /stock/buffers` response. */
export interface StockBuffersResponse {
  data: (StockCell & { articleId: ID })[]
}

// ---- §8.2 Call-off orders ----

/** `POST /calloff-orders` request body. */
export interface CallOffCreate {
  siteId: ID
  deliveryDate: ISODate
  note?: string | null
}
export interface CallOffOrderSummary {
  id: ID
  number: string
  site: SiteRef
  status: CallOffOrderStatus
  deliveryDate: ISODate
  lineCount: number
  totalQuantity: number
  recipientEmail: string
  createdBy: UserRef
  createdAt: ISODateTime
  sentAt: ISODateTime | null
  sentBy: UserRef | null
}
export interface CallOffLine {
  id: ID
  article: ArticleRef
  demandQty: number
  stockQty: number
  bufferQty: number
  suggestedQty: number
  quantity: number
  minQty: number | null
  maxQty: number | null
  warnings: ('below_min' | 'above_max')[]
}
export interface CallOffOrder extends CallOffOrderSummary {
  note: string | null
  lines: CallOffLine[]
  warnings: string[]
  availableActions: string[]
  version: number
  mailLogEntityRef: EntityRef
}
export interface CallOffOrderPatch {
  version?: number
  deliveryDate?: ISODate
  note?: string | null
  recipientEmail?: string
  /** Upsert; quantity 0 removes the line. */
  lines?: { articleId: ID; quantity: number }[]
}
/** `POST /calloff-orders/{id}/actions/send` request body. */
export interface CallOffSendBody {
  version?: number
}

// ---- §8.3 Assets ----

export interface AssetListItem extends AssetSummary {
  site: SiteRef | null
  assignedContact: ContactRef | null
  checkedInAt: ISODateTime | null
  statusChangedAt: ISODateTime
  source: AssetSource
  availableActions: string[]
}
export interface AssetDetail extends AssetListItem {
  version: number
  externalAssetId: string | null
  ciName: string | null
  orderNumber: string | null
  macAddress: string | null
  leaseReturn: { id: ID; status: LeaseReturnStatus; retirementDate: ISODate } | null
  /** Last 20. */
  recentMovements: AssetMovement[]
  blockedActions: BlockedAction[]
}
export interface AssetMovement {
  id: ID
  action: AssetAction
  actionLabel: string
  fromStatus: AssetStatus | null
  toStatus: AssetStatus
  fromLocation: LocationRef | null
  toLocation: LocationRef
  fromInstallationPlace: string | null
  toInstallationPlace: string | null
  serviceRequest: { id: ID; number: string } | null
  actor: UserRef | null
  trigger: Trigger
  reason: string | null
  sourceRef: string | null
  occurredAt: ISODateTime
}
/** `PATCH /assets/{id}` request body (status/location only via actions). */
export interface AssetPatch {
  version?: number
  assetTag?: string | null
  macAddress?: string | null
  externalAssetId?: string | null
  ciName?: string | null
}

// ---- §8.4 Deactivation ----

export interface DeactivationBatch {
  id: ID
  reason: DeactivationReason
  originalFilename: string
  totalRows: number
  deactivatedCount: number
  alreadyDeactivatedCount: number
  rejectedCount: number
  notFoundCount: number
  createdBy: UserRef
  createdAt: ISODateTime
}
export interface DeactivationResult extends DeactivationBatch {
  notFoundReport: DownloadLink | null
  rejectedReport: DownloadLink | null
  closedLeaseReturns: number
  /** First 50 rows. */
  sample: {
    serialNumber: string
    outcome: 'deactivated' | 'already_deactivated' | 'rejected' | 'not_found'
    detail: string | null
  }[]
}

// ---- §8.5 Inventory ----

/** `POST /inventories` request body. */
export interface InventoryCreate {
  siteId: ID
  note?: string | null
}
/** `POST /inventories/{id}/scans` request body. */
export interface InventoryScanBody {
  serial: string
  stockLocationId?: ID | null
}
/** `POST /inventories/{id}/actions/close` request body. */
export interface InventoryCloseBody {
  countDate: ISODate
  applyCorrections: boolean
}
export interface InventorySummary {
  id: ID
  site: SiteRef
  status: InventoryStatus
  openedAt: ISODateTime
  openedBy: UserRef
  closedAt: ISODateTime | null
  closedBy: UserRef | null
  countDate: ISODate | null
  /** Live while open, frozen when closed. */
  summary: {
    expected: number
    matched: number
    missing: number
    wrongLocation: number
    unknown: number
    corrected: number | null
  }
}
export interface InventoryScan {
  id: ID
  serialNumber: string
  result: InventoryScanResult
  asset: AssetSummary | null
  scannedLocation: LocationRef | null
  recordedLocation: LocationRef | null
  scannedBy: UserRef
  scannedAt: ISODateTime
}
export interface InventoryDetail extends InventorySummary {
  note: string | null
  applyCorrections: boolean | null
  version: number
  progress: { scanned: number; expected: number; percent: number }
  /** Site locations selectable at the scan station. */
  zones: LocationRef[]
  /** Last 20, all users. */
  recentScans: InventoryScan[]
  /** `'close' | 'cancel'` */
  availableActions: string[]
}
export interface ReconciliationItem {
  serialNumber: string
  asset: AssetSummary | null
  category: 'matched' | 'missing' | 'wrong_location' | 'unknown'
  recordedLocation: LocationRef | null
  scannedLocation: LocationRef | null
  scannedBy: UserRef | null
  scannedAt: ISODateTime | null
  /** Would be corrected by `applyCorrections`. */
  correctable: boolean
}
export interface Reconciliation extends Page<ReconciliationItem> {
  summary: InventorySummary['summary']
}

// ---- §8.6 Dashboard ----

export interface DashboardKpis {
  asOf: ISODateTime
  today: ISODate
  filters: { siteId: ID | null; regionId: ID | null }
  tiles: {
    openServiceRequests: number
    needsAttention: number
    appointmentsToday: number
    appointmentsThisWeek: number
    completedThisWeek: number
    completedLastWeek: number
    escalatedServiceRequests: number
    escalatedLeaseReturns: number
    hardwareUnavailable: number
    rescheduleNeeded: number
    leaseReturnsDueNext30Days: number
    leaseReturnsOverdue: number
    /** Article×hub cells with demand > stock. */
    stockShortfallArticles: number
    openInventories: number
    /** From `status_transitions` of mail actions. */
    chainMailsSentToday: number
    avgDaysImportToCompletion30d: number | null
    lastImportAt: ISODateTime | null
    lastAppointmentSyncAt: ISODateTime | null
    lastStockCalculationAt: ISODateTime | null
  }
  stageCounts: { stage: PipelineStage; count: number }[]
  series: {
    /** Last 14 days incl. today. */
    completionsPerDay: { date: ISODate; count: number }[]
    /** Today + next 13 days. */
    appointmentsPerDay: { date: ISODate; count: number }[]
    /** SRs first imported, last 14 days. */
    importedPerDay: { date: ISODate; count: number }[]
  }
  regionLoad: {
    region: RegionRef
    open: number
    booked: number
    completedThisWeek: number
    escalated: number
  }[]
  /** Top 10 by demand − stock. */
  stockAlerts: {
    article: ArticleRef
    site: SiteRef
    stock: number
    demand: number
    buffer: number
    orderQty: number
  }[]
}
