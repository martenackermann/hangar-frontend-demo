import { useQuery } from '@tanstack/react-query'
import { Check, CircleAlert, Copy, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Button, IconButton } from '@/components/ui/button'
import { Checkbox, Switch } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Banner, EmptyState, FlagBadge, Skeleton } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/input'
import { KeyValue, KeyValues, SectionHeading } from '@/components/ui/page'
import { Select } from '@/components/ui/select'
import { notify } from '@/components/ui/toast'
import { useHubs } from '@/lib/api/core'
import { isApiError } from '@/lib/api/errors'
import type {
  DeliveryType,
  ProcurementType,
  RegionDetail,
  RegionPatch,
  RegionRule,
  RegionRuleInput,
  RegionRuleMatchKind,
} from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatNumber } from '@/lib/format'
import { useShortcut } from '@/lib/shortcuts'
import { regionQueries, useDeleteRule, useSaveRegion, useSaveRule } from '../api'

/**
 * Region drawer body (SCREENS.md §9.2): `RegionPatch` form, booking link example and the
 * Rules table with inline add/edit/delete (`/region-rules`).
 */
const DELIVERY: DeliveryType[] = ['technician', 'parcel_to_user', 'parcel_to_pickup_point']
const MATCH_KINDS: RegionRuleMatchKind[] = ['zip_prefix', 'zip', 'city', 'cost_center']
const PROCUREMENT: ProcurementType[] = ['replacement', 'new_hire', 'additional_device', 'removal']

function errorText(error: unknown): string {
  if (!isApiError(error)) return 'Not saved.'
  const fields = Object.entries(error.fieldErrors).map(([, messages]) => messages.join(' '))
  return fields.length ? fields.join(' ') : (error.detail ?? error.title)
}

export function RegionEditor({ id }: { id: number }) {
  const query = useQuery(regionQueries.detail(id))
  if (query.isPending) {
    return (
      <div className="grid grid-cols-1 gap-3 px-4 py-4">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (query.error || !query.data) {
    return (
      <div className="px-4 py-4">
        <Banner tone="critical" icon={CircleAlert} title="The region could not be loaded" />
      </div>
    )
  }
  return <RegionBody key={`${query.data.id}-${query.dataUpdatedAt}`} region={query.data} />
}

interface RegionDraft {
  name: string
  supplyingSiteId: string
  defaultDeliveryType: DeliveryType
  bookingDestinationId: string
  bookingServiceId: string
  pickupName: string
  pickupStreet: string
  pickupZip: string
  pickupCity: string
  isActive: boolean
}

function draftOf(region: RegionDetail): RegionDraft {
  return {
    name: region.name,
    supplyingSiteId: String(region.supplyingSite.id),
    defaultDeliveryType: region.defaultDeliveryType,
    bookingDestinationId: region.bookingDestinationId ?? '',
    bookingServiceId: region.bookingServiceId ?? '',
    pickupName: region.pickupPoint?.name ?? '',
    pickupStreet: region.pickupPoint?.street ?? '',
    pickupZip: region.pickupPoint?.zip ?? '',
    pickupCity: region.pickupPoint?.city ?? '',
    isActive: region.isActive,
  }
}

function RegionBody({ region }: { region: RegionDetail }) {
  const enums = useEnums()
  const hubs = useHubs()
  const canManage = useCan('master.manage')
  const save = useSaveRegion(region.id)
  const [draft, setDraft] = useState(() => draftOf(region))
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(region))
  const set = <K extends keyof RegionDraft>(key: K, value: RegionDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const submit = async () => {
    setError(null)
    const body: RegionPatch = {
      name: draft.name.trim(),
      supplyingSiteId: Number(draft.supplyingSiteId),
      defaultDeliveryType: draft.defaultDeliveryType,
      bookingDestinationId: draft.bookingDestinationId.trim() || null,
      bookingServiceId: draft.bookingServiceId.trim() || null,
      pickupPoint: draft.pickupName.trim()
        ? {
            name: draft.pickupName.trim(),
            street: draft.pickupStreet.trim() || null,
            zip: draft.pickupZip.trim() || null,
            city: draft.pickupCity.trim() || null,
          }
        : null,
      isActive: draft.isActive,
    }
    try {
      await save.mutateAsync(body)
    } catch (cause) {
      setError(errorText(cause))
    }
  }
  useShortcut('mod+s', () => void submit(), {
    enabled: canManage && dirty,
    allowInInput: true,
    description: 'Save region',
    group: 'Form',
  })

  const input = (key: keyof RegionDraft, label: string, mono = false) => (
    <Field label={label}>
      {({ id }) => (
        <Input
          id={id}
          value={String(draft[key])}
          readOnly={!canManage}
          className={mono ? 'font-mono' : undefined}
          onChange={(event) => set(key, event.target.value as never)}
        />
      )}
    </Field>
  )

  return (
    <div className="grid grid-cols-1 gap-4 px-4 pt-3 pb-6">
      <form
        className="grid grid-cols-1 gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          {input('name', 'Name')}
          <Field label="Supplying hub">
            {({ id }) => (
              <Select<string>
                id={id}
                value={draft.supplyingSiteId}
                onValueChange={(value) => set('supplyingSiteId', value)}
                disabled={!canManage}
                options={hubs.map((hub) => ({ value: String(hub.id), label: hub.name }))}
              />
            )}
          </Field>
          <Field label="Default delivery">
            {({ id }) => (
              <Select<DeliveryType>
                id={id}
                value={draft.defaultDeliveryType}
                onValueChange={(value) => set('defaultDeliveryType', value)}
                disabled={!canManage}
                options={DELIVERY.map((value) => ({
                  value,
                  label: enumLabel(enums, 'deliveryType', value),
                }))}
              />
            )}
          </Field>
          <div className="flex items-end pb-1">
            <Switch
              checked={draft.isActive}
              onCheckedChange={(checked) => set('isActive', checked)}
              disabled={!canManage}
              label="Active"
            />
          </div>
          {input('bookingDestinationId', 'Booking destination id', true)}
          {input('bookingServiceId', 'Booking service id', true)}
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-xs font-semibold text-fg-2">
            Pickup point (parcel to pickup point)
          </legend>
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            {input('pickupName', 'Name')}
            {input('pickupStreet', 'Street')}
            {input('pickupZip', 'Zip', true)}
            {input('pickupCity', 'City')}
          </div>
        </fieldset>
        {error && (
          <Banner tone="critical" icon={CircleAlert} title="Not saved">
            {error}
          </Banner>
        )}
        {canManage && (
          <Button
            type="submit"
            variant="primary"
            icon={Save}
            shortcut="mod+s"
            className="justify-self-start"
            loading={save.isPending}
            disabled={!dirty}
          >
            Save region
          </Button>
        )}
      </form>

      <KeyValues columns={2}>
        <KeyValue label="Open requests">{formatNumber(region.openServiceRequests)}</KeyValue>
        <KeyValue label="Booking link example" full>
          {region.bookingLinkExample ? (
            <span className="flex items-center gap-1.5">
              <span className="truncate font-mono text-xs">{region.bookingLinkExample}</span>
              <IconButton
                icon={Copy}
                size="sm"
                label="Copy booking link"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(region.bookingLinkExample ?? '')
                    .then(() => notify.success('Link copied', { duration: 2000 }))
                }}
              />
            </span>
          ) : null}
        </KeyValue>
      </KeyValues>

      <RulesTable region={region} />
    </div>
  )
}

// ---- rules ---------------------------------------------------------------------------------------

interface RuleDraft {
  matchKind: RegionRuleMatchKind
  pattern: string
  procurementType: ProcurementType | 'any'
  deliveryType: DeliveryType | 'default'
  isCampus: boolean
  priority: string
  isActive: boolean
  note: string
}

function ruleDraft(rule?: RegionRule): RuleDraft {
  return {
    matchKind: rule?.matchKind ?? 'zip_prefix',
    pattern: rule?.pattern ?? '',
    procurementType: rule?.procurementType ?? 'any',
    deliveryType: rule?.deliveryType ?? 'default',
    isCampus: rule?.isCampus ?? false,
    priority: String(rule?.priority ?? 0),
    isActive: rule?.isActive ?? true,
    note: rule?.note ?? '',
  }
}

function RulesTable({ region }: { region: RegionDetail }) {
  const enums = useEnums()
  const canManage = useCan('master.manage')
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [deleting, setDeleting] = useState<RegionRule | null>(null)
  const remove = useDeleteRule()

  return (
    <section aria-labelledby={`rules-${region.id}`}>
      <SectionHeading
        actions={
          canManage && editing === null ? (
            <Button size="sm" icon={Plus} onClick={() => setEditing('new')}>
              Add rule
            </Button>
          ) : null
        }
      >
        <span id={`rules-${region.id}`}>Rules · {region.rules.length}</span>
      </SectionHeading>
      {region.rules.length === 0 && editing !== 'new' ? (
        <EmptyState icon={CircleAlert} title="No rules for this region">
          Requests from its addresses will stay unresolved.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-3">
                {[
                  'Match',
                  'Pattern',
                  'Procurement',
                  'Delivery',
                  'Campus',
                  'Priority',
                  'Active',
                  'Matches',
                  '',
                ].map((header) => (
                  <th key={header} scope="col" className="py-1.5 pr-2 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {region.rules.map((rule) =>
                editing === rule.id ? (
                  <RuleRow
                    key={rule.id}
                    region={region}
                    rule={rule}
                    onDone={() => setEditing(null)}
                  />
                ) : (
                  <tr key={rule.id} className="border-b border-line-subtle">
                    <td className="py-1.5 pr-2">
                      {enumLabel(enums, 'regionRuleMatchKind', rule.matchKind)}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-xs">{rule.normalizedPattern}</td>
                    <td className="py-1.5 pr-2 text-fg-2">
                      {rule.procurementType
                        ? enumLabel(enums, 'procurementType', rule.procurementType)
                        : 'Any'}
                    </td>
                    <td className="py-1.5 pr-2 text-fg-2">
                      {rule.deliveryType
                        ? enumLabel(enums, 'deliveryType', rule.deliveryType)
                        : 'Region default'}
                    </td>
                    <td className="py-1.5 pr-2">
                      {rule.isCampus ? <FlagBadge>Campus</FlagBadge> : ''}
                    </td>
                    <td className="py-1.5 pr-2 font-mono">{rule.priority}</td>
                    <td className="py-1.5 pr-2">
                      {rule.isActive ? 'Yes' : <FlagBadge>Off</FlagBadge>}
                    </td>
                    <td className="py-1.5 pr-2 font-mono">{formatNumber(rule.matchCount)}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      {canManage && (
                        <>
                          <IconButton
                            icon={Pencil}
                            size="sm"
                            label={`Edit rule ${rule.normalizedPattern}`}
                            onClick={() => setEditing(rule.id)}
                          />
                          <IconButton
                            icon={Trash2}
                            size="sm"
                            label={`Delete rule ${rule.normalizedPattern}`}
                            onClick={() => setDeleting(rule)}
                          />
                        </>
                      )}
                    </td>
                  </tr>
                ),
              )}
              {editing === 'new' && <RuleRow region={region} onDone={() => setEditing(null)} />}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete the rule ${deleting?.normalizedPattern ?? ''}?`}
        description={
          deleting?.matchCount
            ? `${formatNumber(deleting.matchCount)} open requests were resolved by it; they keep their region until the rules are reapplied.`
            : 'No open request was resolved by this rule.'
        }
        confirmLabel="Delete rule"
        destructive
        pending={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id)
          setDeleting(null)
        }}
      />
    </section>
  )
}

function RuleRow({
  region,
  rule,
  onDone,
}: {
  region: RegionDetail
  rule?: RegionRule
  onDone: () => void
}) {
  const enums = useEnums()
  const save = useSaveRule(rule?.id ?? null)
  const [draft, setDraft] = useState(() => ruleDraft(rule))
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const submit = async () => {
    setError(null)
    const body: RegionRuleInput = {
      regionId: region.id,
      matchKind: draft.matchKind,
      pattern: draft.pattern,
      procurementType: draft.procurementType === 'any' ? null : draft.procurementType,
      deliveryType: draft.deliveryType === 'default' ? null : draft.deliveryType,
      isCampus: draft.isCampus,
      priority: Number(draft.priority) || 0,
      isActive: draft.isActive,
      note: draft.note.trim() || null,
    }
    try {
      await save.mutateAsync(body)
      onDone()
    } catch (cause) {
      setError(errorText(cause))
    }
  }

  return (
    <>
      <tr className="border-b border-line-subtle bg-sunken align-top">
        <td className="py-1.5 pr-2">
          <Select<RegionRuleMatchKind>
            label="Match kind"
            value={draft.matchKind}
            onValueChange={(value) => set('matchKind', value)}
            options={MATCH_KINDS.map((value) => ({
              value,
              label: enumLabel(enums, 'regionRuleMatchKind', value),
            }))}
          />
        </td>
        <td className="py-1.5 pr-2">
          <Input
            aria-label="Pattern"
            value={draft.pattern}
            data-autofocus
            onChange={(event) => set('pattern', event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit()
              if (event.key === 'Escape') onDone()
            }}
            className="w-28 font-mono"
          />
        </td>
        <td className="py-1.5 pr-2">
          <Select<ProcurementType | 'any'>
            label="Procurement type"
            value={draft.procurementType}
            onValueChange={(value) => set('procurementType', value)}
            options={[
              { value: 'any', label: 'Any' },
              ...PROCUREMENT.map((value) => ({
                value,
                label: enumLabel(enums, 'procurementType', value),
              })),
            ]}
          />
        </td>
        <td className="py-1.5 pr-2">
          <Select<DeliveryType | 'default'>
            label="Delivery type"
            value={draft.deliveryType}
            onValueChange={(value) => set('deliveryType', value)}
            options={[
              { value: 'default', label: 'Region default' },
              ...DELIVERY.map((value) => ({
                value,
                label: enumLabel(enums, 'deliveryType', value),
              })),
            ]}
          />
        </td>
        <td className="py-2.5 pr-2">
          <Checkbox
            aria-label="Campus"
            checked={draft.isCampus}
            onCheckedChange={(checked) => set('isCampus', checked)}
          />
        </td>
        <td className="py-1.5 pr-2">
          <Input
            aria-label="Priority"
            inputMode="numeric"
            value={draft.priority}
            onChange={(event) => set('priority', event.target.value.replace(/[^\d-]/g, ''))}
            className="w-14 font-mono"
          />
        </td>
        <td className="py-2.5 pr-2">
          <Checkbox
            aria-label="Active"
            checked={draft.isActive}
            onCheckedChange={(checked) => set('isActive', checked)}
          />
        </td>
        <td className="py-1.5 pr-2" />
        <td className="py-1.5 text-right whitespace-nowrap">
          <IconButton icon={Check} size="sm" label="Save rule" onClick={() => void submit()} />
          <IconButton icon={X} size="sm" label="Cancel" onClick={onDone} />
        </td>
      </tr>
      <tr className="bg-sunken">
        <td colSpan={9} className="pb-2">
          <Input
            aria-label="Note"
            placeholder="Note (optional)"
            value={draft.note}
            onChange={(event) => set('note', event.target.value)}
          />
          {error && <p className="mt-1 text-xs text-tone-critical-fg">{error}</p>}
        </td>
      </tr>
    </>
  )
}
