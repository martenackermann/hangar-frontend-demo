import { z } from 'zod'
import type {
  AttentionFlag,
  DeliveryType,
  LeaseReturnStatus,
  MailStatus,
  PipelineStage,
  ProcurementType,
  ServiceRequestStatus,
  Trigger,
} from '@/lib/api/types'
import {
  boolParam,
  dateParam,
  enumParam,
  idListParam,
  idParam,
  listParam,
  listSearchSchema,
  stringParam,
} from '@/lib/search/params'

/** Enum value tuples for the URL codecs (SCREENS.md §0 "URL = state"). */
export const SR_STATUSES = [
  'imported',
  'imported_vip',
  'hardware_unavailable',
  'invited',
  'campus_info_sent',
  'reminder_1_sent',
  'reminder_2_sent',
  'escalated',
  'reschedule_needed',
  'appointment_booked',
  'personalization_in_progress',
  'personalization_done',
  'ready_for_picking',
  'shipped',
  'provided',
  'completed',
  'cancelled',
] as const satisfies readonly ServiceRequestStatus[]

export const PIPELINE_STAGES = [
  'imported',
  'invited',
  'booked',
  'personalizing',
  'ready',
  'delivery',
  'deployed',
  'closed',
] as const satisfies readonly PipelineStage[]

export const LEASE_STATUSES = [
  'imported',
  'imported_vip',
  'info_sent',
  'reminder_1_sent',
  'reminder_2_sent',
  'escalated',
  'replacement_ordered',
  'probably_closed',
  'closed',
] as const satisfies readonly LeaseReturnStatus[]

export const DELIVERY_TYPES = [
  'technician',
  'parcel_to_user',
  'parcel_to_pickup_point',
] as const satisfies readonly DeliveryType[]

export const PROCUREMENT_TYPES = [
  'replacement',
  'new_hire',
  'additional_device',
  'removal',
] as const satisfies readonly ProcurementType[]

export const ATTENTION_FLAGS = [
  'region_unresolved',
  'contact_email_missing',
  'unknown_article',
  'appointment_soon_not_ready',
  'appointment_overdue',
  'escalated_stale',
  'itsm_closed',
  'hold_group_left',
  'retirement_passed',
  'not_collected',
] as const satisfies readonly AttentionFlag[]

export const MAIL_STATUSES = ['queued', 'sent', 'failed'] as const satisfies readonly MailStatus[]
export const TRIGGERS = [
  'user',
  'job',
  'import',
  'sync',
  'system',
] as const satisfies readonly Trigger[]
export const VIP_MODES = ['exclude', 'include', 'only'] as const

// ---- route schemas --------------------------------------------------------------------------------

export const PIPELINE_SORTS = ['appointmentStartAt', 'statusChangedAt', '-importedAt'] as const

export const pipelineSearchSchema = z.object({
  siteId: idListParam(),
  regionId: idListParam({ allowNone: true }),
  deliveryType: listParam(DELIVERY_TYPES),
  vip: enumParam(VIP_MODES),
  campus: boolParam(),
  /** Per-column status chip filter (SCREENS.md §3.1). */
  status: listParam(SR_STATUSES),
  needsAttention: boolParam(),
  sort: enumParam(PIPELINE_SORTS),
  view: stringParam(),
})
export type PipelineSearch = z.infer<typeof pipelineSearchSchema>

export const srSearchSchema = listSearchSchema.extend({
  status: listParam(SR_STATUSES),
  stage: listParam(PIPELINE_STAGES),
  regionId: idListParam({ allowNone: true }),
  siteId: idListParam(),
  deliveryType: listParam(DELIVERY_TYPES),
  procurementType: listParam(PROCUREMENT_TYPES),
  vip: enumParam(VIP_MODES),
  campus: boolParam(),
  editorId: stringParam(),
  contactId: idParam(),
  appointmentFrom: dateParam(),
  appointmentTo: dateParam(),
  hasAppointment: boolParam(),
  communicationFrom: dateParam(),
  communicationTo: dateParam(),
  importedFrom: dateParam(),
  importedTo: dateParam(),
  closedFrom: dateParam(),
  closedTo: dateParam(),
  paused: boolParam(),
  attention: listParam(ATTENTION_FLAGS),
  needsAttention: boolParam(),
  includeClosed: boolParam(),
})
export type SrSearch = z.infer<typeof srSearchSchema>

export const leaseSearchSchema = listSearchSchema.extend({
  status: listParam(LEASE_STATUSES),
  vip: enumParam(VIP_MODES),
  campus: boolParam(),
  retirementFrom: dateParam(),
  retirementTo: dateParam(),
  communicationFrom: dateParam(),
  communicationTo: dateParam(),
  linked: boolParam(),
  paused: boolParam(),
  attention: listParam(ATTENTION_FLAGS),
  needsAttention: boolParam(),
  includeClosed: boolParam(),
})
export type LeaseSearch = z.infer<typeof leaseSearchSchema>

export const COMMS_VIEWS = ['mail-log', 'dispatch-runs', 'templates'] as const

export const commsSearchSchema = listSearchSchema.extend({
  view: enumParam(COMMS_VIEWS),
  templateId: listParam([
    'sr.invitation',
    'sr.campus_info',
    'sr.reminder_1',
    'sr.reminder_2',
    'sr.escalation',
    'sr.hardware_unavailable',
    'sr.reschedule',
    'sr.reschedule_campus',
    'sr.shipping_confirmation',
    'sr.protocol',
    'lease.info',
    'lease.info_campus',
    'lease.reminder_1',
    'lease.reminder_1_campus',
    'lease.reminder_2',
    'lease.reminder_2_campus',
    'lease.escalation',
    'lease.escalation_campus',
    'tour.assigned',
    'calloff.order',
    'inventory.report',
    'import.summary',
  ]),
  status: listParam(MAIL_STATUSES),
  trigger: listParam(TRIGGERS),
  entityType: enumParam(['service_request', 'lease_return', 'calloff_order', 'inventory', 'import_job', 'tour']),
  from: dateParam(),
  to: dateParam(),
  /** Dispatch run drawer (`?run=12`). */
  run: idParam(),
  /** Template preview (`?template=sr.invitation`). */
  template: stringParam(),
  /** Opens the "Send due mails" dry-run dialog (⌘K "Dispatch dry run"). */
  preview: boolParam(),
})
export type CommsSearch = z.infer<typeof commsSearchSchema>
