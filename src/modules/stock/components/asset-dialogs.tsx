import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useStockLocations } from '@/lib/api/core'
import { isApiError } from '@/lib/api/errors'
import type { AssetStatus, StockLocation } from '@/lib/api/types'
import { useEnums } from '@/lib/enums'
import { useShortcut } from '@/lib/shortcuts'

/**
 * Forms of the H5 asset actions (SPEC §4.3, API.md §3.8): `mark_missing {reason?}`,
 * `mark_found {locationId, installationPlace?}`, `correct {status?, locationId?,
 * installationPlace?, reason}`. Used by the drawer action dialogs and the Assets bulk bar.
 * `comment` mirrors the reason so the history row carries it (and the demo engine's
 * required-comment check is satisfied).
 */

export type AssetActionBody = Record<string, unknown>

const KEEP = 'keep'
const PLACE = /^[A-Z]{1,2}[0-9]{1,2}-[0-9]{1,3}$/

function errorsOf(error: unknown): Record<string, string> {
  if (!isApiError(error)) return { root: 'The action failed.' }
  const fields = Object.fromEntries(
    Object.entries(error.fieldErrors).map(([key, messages]) => [key, messages.join(' ')]),
  )
  if (Object.keys(fields).length) return fields
  return { root: error.guard?.message ?? error.detail ?? error.title }
}

function locationLabel(location: StockLocation): string {
  return location.name
}

function ActionFormDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  onSubmit,
  error,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel: string
  pending: boolean
  onSubmit: () => void
  error?: string | undefined
  children: ReactNode
}) {
  useShortcut('mod+enter', onSubmit, { enabled: open, allowInDialog: true, allowInInput: true })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={description}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" shortcut="mod+enter" loading={pending} onClick={onSubmit}>
              {confirmLabel}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          {children}
          {error && (
            <p role="alert" className="text-sm text-tone-critical-fg">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Mark missing: optional reason. */
export function MarkMissingDialog({
  open,
  onOpenChange,
  subject,
  pending,
  submit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subject: string
  pending: boolean
  submit: (body: AssetActionBody) => Promise<unknown>
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()
  const run = async () => {
    try {
      const text = reason.trim()
      await submit(text ? { reason: text, comment: text } : {})
      onOpenChange(false)
    } catch (err) {
      setError(Object.values(errorsOf(err)).join(' '))
    }
  }
  return (
    <ActionFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Mark ${subject} missing?`}
      description="The location stays as last known; the device no longer counts as stock."
      confirmLabel="Mark missing"
      pending={pending}
      onSubmit={() => void run()}
      error={error}
    >
      <Field label="Reason (optional)">
        {({ id }) => (
          <Textarea
            id={id}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Not on its shelf during the stock-take…"
          />
        )}
      </Field>
    </ActionFormDialog>
  )
}

function useTargetLocations() {
  return useStockLocations().filter(
    (l) => l.isActive && ['goods_in', 'staging', 'goods_out', 'return'].includes(l.type),
  )
}

/** Mark found: target location (stock → available, returns → collected) + optional place. */
export function MarkFoundDialog({
  open,
  onOpenChange,
  subject,
  pending,
  submit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subject: string
  pending: boolean
  submit: (body: AssetActionBody) => Promise<unknown>
}) {
  const locations = useTargetLocations()
  const [locationId, setLocationId] = useState<string>()
  const [place, setPlace] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const location = locations.find((l) => String(l.id) === locationId)
  const run = async () => {
    const local: Record<string, string> = {}
    if (!locationId) local.locationId = 'Choose where the device was found.'
    const normalized = place.trim().toUpperCase()
    if (normalized && !PLACE.test(normalized.replace(/^LOC:/, '')))
      local.installationPlace = 'Use the format B4-12 (shelf-slot).'
    setErrors(local)
    if (Object.keys(local).length) return
    try {
      await submit({
        locationId: Number(locationId),
        ...(normalized && location?.type === 'staging' ? { installationPlace: normalized } : {}),
      })
      onOpenChange(false)
    } catch (err) {
      setErrors(errorsOf(err))
    }
  }
  return (
    <ActionFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Mark ${subject} found`}
      description="A stock location makes it available again; a returns location makes it return pending."
      confirmLabel="Mark found"
      pending={pending}
      onSubmit={() => void run()}
      error={errors.root}
    >
      <Field label="Found at" required error={errors.locationId}>
        {({ id }) => (
          <Select
            id={id}
            label="Found at"
            placeholder="Choose a location"
            value={locationId}
            onValueChange={setLocationId}
            options={locations.map((l) => ({ value: String(l.id), label: locationLabel(l) }))}
          />
        )}
      </Field>
      {location?.type === 'staging' && (
        <Field
          label="Installation place (optional)"
          error={errors.installationPlace}
          help="Shelf-slot, e.g. B4-12"
        >
          {({ id }) => (
            <Input
              id={id}
              value={place}
              onChange={(event) => setPlace(event.target.value)}
              className="font-mono"
            />
          )}
        </Field>
      )}
    </ActionFormDialog>
  )
}

/** Correct status/location/place (reason required; invariants are checked by the API → 422). */
export function CorrectDialog({
  open,
  onOpenChange,
  subject,
  pending,
  submit,
  current,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** "GX204811" or "12 assets". */
  subject: string
  pending: boolean
  submit: (body: AssetActionBody) => Promise<unknown>
  /** Single asset: preselect its values. */
  current?: { status: AssetStatus; locationId: number; installationPlace: string | null }
}) {
  const enums = useEnums()
  const locations = useStockLocations().filter((l) => l.isActive)
  const [status, setStatus] = useState<string>(KEEP)
  const [locationId, setLocationId] = useState<string>(KEEP)
  const [place, setPlace] = useState(current?.installationPlace ?? '')
  const [placeTouched, setPlaceTouched] = useState(false)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const run = async () => {
    const local: Record<string, string> = {}
    if (!reason.trim()) local.reason = 'A reason is required for corrections.'
    const normalized = place.trim().toUpperCase()
    if (placeTouched && normalized && !PLACE.test(normalized))
      local.installationPlace = 'Use the format B4-12 (shelf-slot).'
    setErrors(local)
    if (Object.keys(local).length) return
    const body: AssetActionBody = { reason: reason.trim(), comment: reason.trim() }
    if (status !== KEEP) body.status = status
    if (locationId !== KEEP) body.locationId = Number(locationId)
    if (placeTouched) body.installationPlace = normalized || null
    try {
      await submit(body)
      onOpenChange(false)
    } catch (err) {
      setErrors(errorsOf(err))
    }
  }
  return (
    <ActionFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Correct ${subject}`}
      description="Fix a wrong record. Every correction is written to the movement ledger with your reason."
      confirmLabel="Save correction"
      pending={pending}
      onSubmit={() => void run()}
      error={errors.root}
    >
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="Status" error={errors.status}>
          {({ id }) => (
            <Select
              id={id}
              label="Status"
              value={status}
              onValueChange={setStatus}
              options={[
                {
                  value: KEEP,
                  label: current
                    ? `Keep (${enums.assetStatus.find((s) => s.value === current.status)?.label ?? current.status})`
                    : 'Keep each status',
                },
                ...enums.assetStatus.map((s) => ({ value: s.value, label: s.label })),
              ]}
            />
          )}
        </Field>
        <Field label="Location" error={errors.locationId}>
          {({ id }) => (
            <Select
              id={id}
              label="Location"
              value={locationId}
              onValueChange={setLocationId}
              options={[
                {
                  value: KEEP,
                  label: current
                    ? `Keep (${locations.find((l) => l.id === current.locationId)?.name ?? '—'})`
                    : 'Keep each location',
                },
                ...locations.map((l) => ({ value: String(l.id), label: l.name })),
              ]}
            />
          )}
        </Field>
      </div>
      <Field
        label="Installation place"
        error={errors.installationPlace}
        help="Only in staging locations. Leave empty to clear it."
      >
        {({ id }) => (
          <Input
            id={id}
            value={place}
            onChange={(event) => {
              setPlace(event.target.value)
              setPlaceTouched(true)
            }}
            className="font-mono"
            placeholder="B4-12"
          />
        )}
      </Field>
      <Field label="Reason" required error={errors.reason}>
        {({ id }) => (
          <Textarea
            id={id}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What was wrong, and how do you know?"
          />
        )}
      </Field>
    </ActionFormDialog>
  )
}
