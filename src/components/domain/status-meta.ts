import {
  Archive,
  Ban,
  BellRing,
  Box,
  CalendarCheck,
  CalendarX,
  Check,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleSlash,
  ClipboardCheck,
  Clock,
  Copy,
  Crown,
  FilePen,
  Flag,
  Inbox,
  Laptop,
  Link,
  Link2,
  LoaderCircle,
  Lock,
  Mail,
  MailCheck,
  MailX,
  MapPinOff,
  Navigation,
  OctagonX,
  PackageCheck,
  PackageOpen,
  PackageX,
  PhoneOutgoing,
  ScanLine,
  SearchX,
  Send,
  Siren,
  TriangleAlert,
  Truck,
  Undo2,
  UserRoundCheck,
  UserRoundX,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { EnumKey } from '@/lib/enums'

/**
 * Status icons (DESIGN.md §3). Labels and tones come from `/meta/enums`; icons are a client
 * concern and live here, keyed by enum key and value. Unknown values fall back to `CircleDashed`.
 */
export type StatusEntity =
  | 'serviceRequestStatus'
  | 'leaseReturnStatus'
  | 'assetStatus'
  | 'importJobStatus'
  | 'inventoryStatus'
  | 'tourStatus'
  | 'tourStopOutcome'
  | 'callOffOrderStatus'
  | 'jobStatus'
  | 'mailStatus'
  | 'appointmentStatus'
  | 'readiness'
  | 'scanVerdict'
  | 'scanCode'
  | 'inventoryScanResult'
  | 'attentionFlag'
  | 'deviationOutcome'

export const STATUS_ICONS: Partial<Record<EnumKey, Record<string, LucideIcon>>> = {
  serviceRequestStatus: {
    imported: Inbox,
    imported_vip: Inbox,
    hardware_unavailable: PackageX,
    invited: Mail,
    campus_info_sent: PhoneOutgoing,
    reminder_1_sent: BellRing,
    reminder_2_sent: BellRing,
    escalated: Siren,
    appointment_booked: CalendarCheck,
    personalization_in_progress: Wrench,
    personalization_done: ClipboardCheck,
    ready_for_picking: PackageCheck,
    shipped: Truck,
    provided: PackageOpen,
    reschedule_needed: CalendarX,
    completed: CircleCheck,
    cancelled: Ban,
  },
  leaseReturnStatus: {
    imported: Inbox,
    imported_vip: Inbox,
    info_sent: Mail,
    reminder_1_sent: BellRing,
    reminder_2_sent: BellRing,
    escalated: Siren,
    replacement_ordered: Link,
    probably_closed: CircleDashed,
    closed: Archive,
  },
  assetStatus: {
    available: Box,
    assigned: Link2,
    prepared: PackageCheck,
    provided: PackageOpen,
    in_use: Laptop,
    collected: Undo2,
    missing: SearchX,
    deactivated_returned: CircleSlash,
    deactivated_bought_out: CircleSlash,
    deactivated_disposed: CircleSlash,
  },
  importJobStatus: {
    queued: Clock,
    processing: LoaderCircle,
    completed: CircleCheck,
    completed_with_errors: TriangleAlert,
    failed: OctagonX,
    cancelled: Ban,
  },
  inventoryStatus: { open: ScanLine, closed: Lock, cancelled: Ban },
  tourStatus: {
    draft: UserRoundX,
    planned: UserRoundCheck,
    in_progress: Navigation,
    completed: Flag,
    cancelled: Ban,
  },
  tourStopOutcome: {
    pending: Clock,
    completed: CircleCheck,
    rescheduled: CalendarX,
    cancelled: Ban,
  },
  callOffOrderStatus: { draft: FilePen, sent: Send, cancelled: Ban },
  jobStatus: {
    queued: Clock,
    running: LoaderCircle,
    succeeded: CircleCheck,
    failed: OctagonX,
    cancelled: Ban,
  },
  mailStatus: { queued: Clock, sent: MailCheck, failed: MailX },
  appointmentStatus: { booked: CalendarCheck, cancelled: CalendarX },
  readiness: { ready: PackageOpen, to_pick: PackageCheck, in_staging: Wrench, not_started: Clock },
  scanVerdict: { ok: Check, warning: TriangleAlert, error: OctagonX },
  scanCode: {
    wrong_location: MapPinOff,
    wrong_zone: MapPinOff,
    wrong_site: MapPinOff,
    unknown_serial: CircleHelp,
    unknown_device: CircleHelp,
    duplicate: Copy,
  },
  inventoryScanResult: { matched: Check, wrong_location: MapPinOff, unknown: CircleHelp },
  attentionFlag: {},
  deviationOutcome: { complete: CircleCheck, reschedule: CalendarX, cancel: Ban },
}

/** Spinning icons (running states). */
export const SPINNING = new Set<LucideIcon>([LoaderCircle])

export function statusIcon(key: EnumKey, value: string): LucideIcon {
  return STATUS_ICONS[key]?.[value] ?? (key === 'attentionFlag' ? TriangleAlert : CircleDashed)
}

export { Crown as VipIcon }
