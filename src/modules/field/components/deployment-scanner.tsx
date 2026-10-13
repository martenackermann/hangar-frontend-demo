import { useQueryClient } from '@tanstack/react-query'
import { Camera, CircleCheck, Undo2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useMediaQuery } from '@/lib/use-media-query'
import { CameraScanner } from '@/components/scan/camera-scanner'
import { ScanInput, type ScanInputHandle } from '@/components/scan/scan-input'
import { useOnline } from '@/components/scan/scan-station'
import { useScanSession } from '@/components/scan/use-scan-session'
import { VerdictBanner } from '@/components/scan/verdict-banner'
import { VERDICT_STYLES } from '@/components/scan/verdict'
import { IdInk } from '@/components/domain/status'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Banner } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/input'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { notify } from '@/components/ui/toast'
import { notifyActionError } from '@/components/drawer/workflow-actions'
import type { DeploymentView, ItemSlot, ScanResult, ServiceRequestItem } from '@/lib/api/types'
import { isApiError } from '@/lib/api/errors'
import { enumLabel, useEnums } from '@/lib/enums'
import {
  FIELD_INVALIDATES,
  scanDeployment,
  useRegisterUnknown,
  useUndoVerification,
} from '@/modules/field/api'
import { cn } from '@/lib/utils'

/**
 * Devices tab of the deployment (SCREENS.md §6.3): Deliver / Collect lists with verified
 * marks and Undo, the scan field (keyboard wedge) and the camera sheet (the kit's code
 * detector), the verdict banner, and the Register device sheet for unknown old devices.
 */
export function DeploymentScanner({
  view,
  cameraOpen,
  onCameraOpenChange,
  disabled,
}: {
  view: DeploymentView
  cameraOpen: boolean
  onCameraOpenChange: (open: boolean) => void
  disabled?: boolean
}) {
  const queryClient = useQueryClient()
  const enums = useEnums()
  const online = useOnline()
  const inputRef = useRef<ScanInputHandle>(null)
  const phone = useMediaQuery('(max-width: 767px)')
  const sr = view.serviceRequest
  const [register, setRegister] = useState<ScanResult<ServiceRequestItem> | null>(null)
  const refresh = () =>
    Promise.all(FIELD_INVALIDATES.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
  const session = useScanSession<ServiceRequestItem>({
    submit: (value) => scanDeployment(sr.id, value),
    onResult: (result) => {
      if (result.applied) void refresh()
      if (result.code === 'unknown_device' && result.canRegister) setRegister(result)
      const progress = result.progress
      if (progress && progress.total > 0 && progress.done >= progress.total)
        onCameraOpenChange(false) // all verified: the camera sheet closes itself
    },
    onUndone: () => void refresh(),
  })
  const undo = useUndoVerification()
  const latest = session.latest
  const latestResult = latest?.result
  const deliver = sr.items.filter((i) => i.direction === 'deliver')
  const collect = sr.items.filter((i) => i.direction === 'collect')
  const { newVerified, newTotal, oldVerified, oldTotal } = view.progress
  const done = newVerified + oldVerified
  const total = newTotal + oldTotal

  const row = (item: ServiceRequestItem) => {
    const verified = item.verifiedAt !== null
    const tag = item.asset?.assetTag ?? item.expectedAssetTag
    return (
      <li
        key={item.id}
        className={cn(
          'flex min-h-14 items-center gap-3 border-b border-line-subtle px-3 py-2 last:border-b-0',
          verified && 'bg-tone-done-wash',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full',
            verified
              ? 'bg-tone-done text-fg-on-accent'
              : 'shadow-[inset_0_0_0_2px_var(--hg-line-strong)]',
          )}
        >
          {verified && <Icon icon={CircleCheck} size={14} />}
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate font-medium">
            {item.article?.name ??
              item.requestedType ??
              item.asset?.model ??
              enumLabel(enums, 'itemSlot', item.slot)}
          </span>
          <span className="flex flex-wrap gap-x-2 text-xs text-fg-3">
            <span>{enumLabel(enums, 'itemSlot', item.slot)}</span>
            {tag && <IdInk value={tag} />}
            {item.asset && <IdInk value={item.asset.serialNumber} whole />}
          </span>
        </div>
        <span className="sr-only">{verified ? 'verified' : 'not verified'}</span>
        {verified && !disabled && (
          <IconButton
            icon={Undo2}
            label={`Undo verification of ${enumLabel(enums, 'itemSlot', item.slot)}`}
            size="touch"
            onClick={() =>
              undo.mutate(
                { srId: sr.id, slot: item.slot },
                {
                  onSuccess: () => notify.success('Verification undone'),
                  onError: (error) =>
                    isApiError(error) && error.code === 'undo_not_possible'
                      ? notify.error(error.detail ?? 'Undo not possible')
                      : notifyActionError(error),
                },
              )
            }
          />
        )}
      </li>
    )
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-fg-2" aria-live="polite">
        <span className="hg-mono font-semibold text-fg">
          {done} of {total}
        </span>{' '}
        verified
      </p>
      {!disabled && (
        <div className="grid gap-3">
          <ScanInput
            ref={inputRef}
            label={phone ? 'Scan device' : 'Scan device (serial or asset tag)'}
            onSubmit={session.scan}
            focusLock={!phone}
            compact={phone}
            disabled={!online}
            disabledReason="Offline — scanning needs a connection."
            tools={
              <Button size="sm" icon={Camera} onClick={() => onCameraOpenChange(true)}>
                Camera
              </Button>
            }
          />
          {latest && latestResult && (
            <VerdictBanner
              result={latestResult}
              sequence={latest.sequence}
              at={latest.at}
              compact
              onUndo={
                latestResult.undo && latestResult.applied && !latest.undone
                  ? () => void session.undo(latest)
                  : undefined
              }
              undoPending={session.undoingId === latest.id}
            />
          )}
          {session.pending > 0 && (
            <p className="text-xs text-fg-3" aria-live="polite">
              {session.pending} scan{session.pending === 1 ? '' : 's'} being checked
            </p>
          )}
        </div>
      )}
      <section aria-label="Deliver">
        <h3 className="mb-1 text-xs font-semibold text-fg-2">
          Deliver · {newVerified}/{newTotal}
        </h3>
        {deliver.length ? (
          <ul className="rounded-md border border-line bg-surface">{deliver.map(row)}</ul>
        ) : (
          <p className="text-sm text-fg-3">No new devices.</p>
        )}
      </section>
      <section aria-label="Collect">
        <h3 className="mb-1 text-xs font-semibold text-fg-2">
          Collect · {oldVerified}/{oldTotal}
        </h3>
        {collect.length ? (
          <ul className="rounded-md border border-line bg-surface">{collect.map(row)}</ul>
        ) : (
          <p className="text-sm text-fg-3">No old devices to collect.</p>
        )}
      </section>
      <CameraScanner
        open={cameraOpen}
        onOpenChange={(open) => {
          onCameraOpenChange(open)
          if (!open) inputRef.current?.focus()
        }}
        onDetected={session.scan}
        flashTone={latestResult ? VERDICT_STYLES[latestResult.verdict].tone : null}
        title={`Scan devices · ${sr.number}`}
      />
      {register && (
        <RegisterDeviceSheet
          srId={sr.id}
          result={register}
          onClose={() => setRegister(null)}
          onRegistered={() => {
            setRegister(null)
            void refresh()
          }}
        />
      )}
    </div>
  )
}

function RegisterDeviceSheet({
  srId,
  result,
  onClose,
  onRegistered,
}: {
  srId: number
  result: ScanResult<ServiceRequestItem>
  onClose: () => void
  onRegistered: () => void
}) {
  const enums = useEnums()
  const mutation = useRegisterUnknown()
  const slots = result.suggestedSlots
  const [slot, setSlot] = useState<ItemSlot | undefined>(slots[0])
  const [serial, setSerial] = useState(result.scannedValue)
  const [assetTag, setAssetTag] = useState('')
  const [model, setModel] = useState('')
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const submit = () => {
    if (!slot) return
    mutation.mutate(
      { srId, slot, serial, assetTag: assetTag || null, model: model || null },
      {
        onSuccess: () => {
          notify.success(`Device ${serial} registered`)
          onRegistered()
        },
        onError: (error) => {
          if (isApiError(error) && error.status === 422) setErrors(error.fieldErrors)
          else notifyActionError(error)
        },
      },
    )
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Register device"
        description="The device is not in the fleet yet. Register it as an old device you collect."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Not now
            </Button>
            <Button
              variant="primary"
              loading={mutation.isPending}
              onClick={submit}
              disabled={!slot}
            >
              Register device
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          {!slots.length && (
            <Banner tone="caution" icon={CircleCheck} title="Every old slot is verified already." />
          )}
          <Field label="Slot" required error={errors.slot?.join(' ')}>
            {({ id }) => (
              <Select<ItemSlot>
                id={id}
                value={slot}
                onValueChange={setSlot}
                options={slots.map((value) => ({
                  value,
                  label: enumLabel(enums, 'itemSlot', value),
                }))}
                className="h-12 w-full"
              />
            )}
          </Field>
          <Field label="Serial number" required error={errors.serial?.join(' ')}>
            {({ id }) => (
              <Input
                id={id}
                value={serial}
                onChange={(e) => setSerial(e.target.value.toUpperCase())}
              />
            )}
          </Field>
          <Field
            label="Asset tag"
            help="Optional, e.g. GX104233"
            error={errors.assetTag?.join(' ')}
          >
            {({ id }) => (
              <Input
                id={id}
                value={assetTag}
                onChange={(e) => setAssetTag(e.target.value.toUpperCase())}
              />
            )}
          </Field>
          <Field label="Model" help="Optional model number" error={errors.model?.join(' ')}>
            {({ id }) => <Input id={id} value={model} onChange={(e) => setModel(e.target.value)} />}
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  )
}
