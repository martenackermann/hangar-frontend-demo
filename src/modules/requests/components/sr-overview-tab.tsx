import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Lock, Pencil, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/ui/feedback'
import { Field, Input, Textarea } from '@/components/ui/input'
import { KeyValue, KeyValues, SectionHeading } from '@/components/ui/page'
import { Select } from '@/components/ui/select'
import { useRegions } from '@/lib/api/core'
import { isApiError } from '@/lib/api/errors'
import type { ServiceRequestDetail } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { businessToday, formatDate, formatFullDateTime } from '@/lib/format'
import { applyServerErrors } from '@/lib/forms/server-errors'
import { useShortcut } from '@/lib/shortcuts'
import { dispatchSettingsQuery, usePatchServiceRequest } from '../api'
import { dueText, srChainHint } from './chain'
import { DELIVERY_TYPES } from '../search'

/** Statuses whose region-relevant fields may change (SPEC_RESOLUTIONS #29). */
const REGION_MUTABLE = new Set([
  'imported',
  'imported_vip',
  'hardware_unavailable',
  'invited',
  'campus_info_sent',
  'reminder_1_sent',
  'reminder_2_sent',
  'escalated',
])
const TERMINAL = new Set(['completed', 'cancelled'])
const MATCH_LABELS = {
  cost_center: 'cost centre',
  zip: 'zip',
  zip_prefix: 'zip prefix',
  city: 'city',
} as const

function regionExplanation(sr: ServiceRequestDetail): string {
  if (!sr.region) return 'No region rule matched the delivery address or cost centre.'
  if (sr.regionOverridden) return `Set manually → ${sr.region.name}`
  if (sr.regionRule)
    return `Matched ${MATCH_LABELS[sr.regionRule.matchKind]} ${sr.regionRule.pattern} → ${sr.region.name}`
  return sr.region.name
}

const schema = z.object({
  street: z.string().max(160),
  zip: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^\d{4,5}$/.test(v.replace(/\D/g, '')),
      'Enter a 4- or 5-digit zip code.',
    ),
  city: z.string().max(80),
  country: z.string().max(60),
  room: z.string().max(40),
  building: z.string().max(40),
  onsiteContactPhone: z.string().max(40),
  note: z.string().max(4000),
  costCenter: z.string().max(20),
  regionId: z.string(),
  deliveryTypeOverride: z.string(),
})
type Values = z.infer<typeof schema>

function defaults(sr: ServiceRequestDetail): Values {
  const a = sr.deliveryAddress
  return {
    street: a.street ?? '',
    zip: a.zip ?? '',
    city: a.city ?? '',
    country: a.country ?? '',
    room: a.room ?? '',
    building: a.building ?? '',
    onsiteContactPhone: sr.onsiteContactPhone ?? '',
    note: sr.note ?? '',
    costCenter: sr.costCenter ?? '',
    regionId: sr.regionOverridden && sr.region ? String(sr.region.id) : 'auto',
    deliveryTypeOverride: sr.deliveryTypeOverride ?? 'auto',
  }
}

const empty = (value: string) => (value.trim() === '' ? null : value.trim())

function EditForm({ sr, onClose }: { sr: ServiceRequestDetail; onClose: () => void }) {
  const enums = useEnums()
  const regions = useRegions()
  const patch = usePatchServiceRequest(sr.id)
  const locked = !REGION_MUTABLE.has(sr.status)
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults(sr) })
  const errors = form.formState.errors
  const [conflict, setConflict] = useState(false)

  const submit = form.handleSubmit(async (values) => {
    const dirty = form.formState.dirtyFields
    const address: Record<string, string | null> = {}
    for (const key of ['street', 'zip', 'city', 'country', 'room', 'building'] as const) {
      if (dirty[key]) address[key] = empty(values[key])
    }
    const body: Record<string, unknown> = { version: sr.version }
    if (Object.keys(address).length) body.deliveryAddress = address
    if (dirty.onsiteContactPhone) body.onsiteContactPhone = empty(values.onsiteContactPhone)
    if (dirty.note) body.note = empty(values.note)
    if (dirty.costCenter) body.costCenter = empty(values.costCenter)
    if (dirty.regionId) body.regionId = values.regionId === 'auto' ? null : Number(values.regionId)
    if (dirty.deliveryTypeOverride)
      body.deliveryTypeOverride =
        values.deliveryTypeOverride === 'auto' ? null : values.deliveryTypeOverride
    try {
      await patch.mutateAsync(body)
      onClose()
    } catch (error) {
      if (isApiError(error) && error.isVersionConflict) {
        setConflict(true)
        return
      }
      if (!isApiError(error) || Object.keys(error.fieldErrors).length === 0) {
        applyServerErrors(error, form.setError, [])
        return
      }
      for (const [path, messages] of Object.entries(error.fieldErrors)) {
        const key = path.replace('deliveryAddress.', '')
        if (key in values)
          form.setError(key as keyof Values, { type: 'server', message: messages.join(' ') })
        else form.setError('root.server', { type: 'server', message: messages.join(' ') })
      }
    }
  })
  useShortcut('mod+s', () => void submit(), {
    allowInInput: true,
    description: 'Save',
    group: 'Forms',
  })
  useShortcut('escape', onClose, { allowInInput: true, description: 'Cancel edit', group: 'Forms' })

  const text = (name: keyof Values, label: string, disabled = false) => (
    <Field label={label} error={errors[name]?.message}>
      {({ id, describedBy, invalid }) => (
        <Input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          disabled={disabled}
          {...form.register(name)}
        />
      )}
    </Field>
  )

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      {conflict && (
        <Banner
          tone="caution"
          icon={RefreshCw}
          title="This record changed. Reload"
          actions={
            <Button size="sm" onClick={onClose}>
              Reload
            </Button>
          }
        >
          Someone else updated the request while you were editing.
        </Banner>
      )}
      {locked && (
        <Banner tone="intake" icon={Lock} title="Region is locked after staging started.">
          Zip, city, cost centre, region and delivery type can no longer change.
        </Banner>
      )}
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <div className="col-span-full">{text('street', 'Street')}</div>
        {text('zip', 'Zip', locked)}
        {text('city', 'City', locked)}
        {text('building', 'Building')}
        {text('room', 'Room')}
        {text('country', 'Country')}
        {text('onsiteContactPhone', 'On-site phone')}
        {text('costCenter', 'Cost centre', locked)}
        <Field
          label="Region"
          error={errors.regionId?.message}
          help="Manual choice overrides the rules."
        >
          {() => (
            <Controller
              control={form.control}
              name="regionId"
              render={({ field }) => (
                <Select
                  label="Region"
                  disabled={locked}
                  value={field.value}
                  onValueChange={field.onChange}
                  options={[
                    { value: 'auto', label: 'Resolved by rules' },
                    ...regions.map((r) => ({ value: String(r.id), label: r.name })),
                  ]}
                  className="w-full"
                />
              )}
            />
          )}
        </Field>
        <Field label="Delivery type" error={errors.deliveryTypeOverride?.message}>
          {() => (
            <Controller
              control={form.control}
              name="deliveryTypeOverride"
              render={({ field }) => (
                <Select
                  label="Delivery type"
                  disabled={locked}
                  value={field.value}
                  onValueChange={field.onChange}
                  options={[
                    { value: 'auto', label: 'As resolved' },
                    ...DELIVERY_TYPES.map((t) => ({
                      value: t,
                      label: enumLabel(enums, 'deliveryType', t),
                    })),
                  ]}
                  className="w-full"
                />
              )}
            />
          )}
        </Field>
        <div className="col-span-full">
          <Field label="Note" error={errors.note?.message}>
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                rows={3}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                {...form.register('note')}
              />
            )}
          </Field>
        </div>
      </div>
      {errors.root?.server && (
        <p role="alert" className="text-xs text-tone-critical-fg">
          {errors.root.server.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" shortcut="mod+s" loading={patch.isPending}>
          Save
        </Button>
      </div>
    </form>
  )
}

export function OverviewTab({ entity: sr }: { entity: ServiceRequestDetail }) {
  const enums = useEnums()
  const canEdit = useCan('sr.update') && !TERMINAL.has(sr.status)
  const canComms = useCan('comms.read')
  const [editing, setEditing] = useState(false)
  const settings = useQuery({ ...dispatchSettingsQuery, enabled: canComms }).data
  const hint = srChainHint(sr, settings)
  useShortcut('e', () => setEditing(true), {
    enabled: canEdit && !editing,
    description: 'Edit request',
    group: 'Drawer',
  })
  const a = sr.deliveryAddress

  return (
    <div>
      <SectionHeading
        actions={
          canEdit &&
          !editing && (
            <Button
              size="sm"
              variant="ghost"
              icon={Pencil}
              shortcut="e"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          )
        }
      >
        Delivery
      </SectionHeading>
      {editing ? (
        <EditForm key={sr.version} sr={sr} onClose={() => setEditing(false)} />
      ) : (
        <KeyValues>
          <KeyValue label="Address" full>
            {[a.street, [a.zip, a.city].filter(Boolean).join(' '), a.country]
              .filter(Boolean)
              .join(', ') || null}
            {(a.building ?? a.room) && (
              <span className="block text-xs text-fg-3">
                {[a.building && `Building ${a.building}`, a.room && `Room ${a.room}`]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </KeyValue>
          <KeyValue label="Region" full>
            {regionExplanation(sr)}
          </KeyValue>
          <KeyValue label="Delivery type">
            {sr.deliveryType ? enumLabel(enums, 'deliveryType', sr.deliveryType) : null}
            {sr.deliveryTypeOverride && (
              <span className="block text-xs text-fg-3">
                overrides {enumLabel(enums, 'deliveryType', sr.resolvedDeliveryType)}
              </span>
            )}
          </KeyValue>
          <KeyValue label="Supplying hub">{sr.supplyingSite?.name}</KeyValue>
          <KeyValue label="On-site phone">{sr.onsiteContactPhone}</KeyValue>
          <KeyValue label="Cost centre">{sr.costCenter}</KeyValue>
          <KeyValue label="Note" full>
            {sr.note}
          </KeyValue>
        </KeyValues>
      )}

      <SectionHeading>Communication</SectionHeading>
      <KeyValues>
        <KeyValue label="Last mail">
          {sr.communicationDate ? formatDate(sr.communicationDate) : null}
        </KeyValue>
        <KeyValue label="Next step">
          {hint ? (
            <>
              {hint.label}
              <span className="block text-xs text-fg-3">
                {hint.manualOnly ? 'chain switched off' : dueText(hint.dueDate)}
              </span>
            </>
          ) : sr.status === 'imported_vip' ? (
            'VIP: no automatic mails'
          ) : sr.status === 'campus_info_sent' ? (
            'Technician calls the employee'
          ) : null}
        </KeyValue>
        <KeyValue label="Paused">
          {sr.communicationPaused
            ? 'Until resumed'
            : sr.communicationResumeDate && sr.communicationResumeDate > businessToday()
              ? `Until ${formatDate(sr.communicationResumeDate)}`
              : null}
          {sr.communicationPauseReason && (
            <span className="block text-xs text-fg-3">{sr.communicationPauseReason}</span>
          )}
        </KeyValue>
        <KeyValue label="Hardware hold mail">
          {sr.hardwareUnavailableNotifiedAt
            ? formatFullDateTime(sr.hardwareUnavailableNotifiedAt)
            : null}
        </KeyValue>
      </KeyValues>

      <SectionHeading>Ticket</SectionHeading>
      <KeyValues>
        <KeyValue label="Task">{sr.taskNumber}</KeyValue>
        <KeyValue label="ITSM state">{sr.itsmState}</KeyValue>
        <KeyValue label="Procurement type">
          {enumLabel(enums, 'procurementType', sr.procurementType)}
        </KeyValue>
        <KeyValue label="Catalog item">{sr.catalogItem}</KeyValue>
        <KeyValue label="Scope of delivery">{sr.scopeOfDelivery}</KeyValue>
        <KeyValue label="Client component">{sr.clientComponent}</KeyValue>
        <KeyValue label="Assignment group">{sr.assignmentGroup}</KeyValue>
        <KeyValue label="Opened">{formatFullDateTime(sr.openedAt)}</KeyValue>
        <KeyValue label="Imported">{formatFullDateTime(sr.importedAt)}</KeyValue>
        <KeyValue label="Last import">{formatFullDateTime(sr.lastImportedAt)}</KeyValue>
        <KeyValue label="Requested software" full>
          {sr.requestedSoftware.join(', ') || null}
        </KeyValue>
        <KeyValue label="Short description" full>
          {sr.shortDescription}
        </KeyValue>
      </KeyValues>
    </div>
  )
}
