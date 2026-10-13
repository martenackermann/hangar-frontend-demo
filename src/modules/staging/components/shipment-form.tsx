import {
  Download,
  ExternalLink,
  OctagonX,
  PackageCheck,
  RotateCcw,
  Store,
  User,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/checkbox'
import { Banner, FlagBadge } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { Kbd } from '@/components/ui/kbd'
import { openDownload } from '@/lib/api/downloads'
import { isApiError } from '@/lib/api/errors'
import type { Address, ShipmentCreated } from '@/lib/api/types'
import { useShortcut } from '@/lib/shortcuts'
import { useCreateShipment } from '@/modules/staging/api'

export interface ShipToView {
  kind: 'user' | 'pickup_point'
  recipientName: string
  name2: string | null
  address: Address
}

/** Ship-to card (SCREENS.md §5.5 step 1): recipient, name line 2, address, pickup badge. */
export function ShipToCard({ shipTo }: { shipTo: ShipToView }) {
  const { address } = shipTo
  return (
    <section
      aria-label="Ship to"
      className="grid gap-1 rounded-sm border border-line bg-surface px-3 py-2.5"
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-fg-2">Ship to</span>
        {shipTo.kind === 'pickup_point' ? (
          <FlagBadge icon={Store}>Pickup point</FlagBadge>
        ) : (
          <FlagBadge icon={User}>User address</FlagBadge>
        )}
      </div>
      <address className="text-sm not-italic">
        <span className="font-medium">{shipTo.recipientName}</span>
        {shipTo.name2 && <span className="block text-fg-2">{shipTo.name2}</span>}
        <span className="block">{address.street ?? '—'}</span>
        <span className="block">
          {[address.zip, address.city].filter(Boolean).join(' ') || '—'}
        </span>
        {address.country && <span className="block text-fg-3">{address.country}</span>}
      </address>
    </section>
  )
}

const WARNINGS: Record<string, string> = {
  no_return_items: 'No return label: the request has no old devices to collect.',
  no_contact_email: 'No confirmation sent: the employee has no email address.',
}

/** Tracking + label links of a created shipment. */
export function ShipmentResult({ created }: { created: ShipmentCreated }) {
  const { shipment } = created
  return (
    <div className="grid gap-2" data-testid="shipment-result">
      <Banner tone="done" icon={PackageCheck} title={`Shipment ${shipment.carrierShipmentId}`}>
        {shipment.parcelCount} parcel{shipment.parcelCount === 1 ? '' : 's'} ·{' '}
        {shipment.confirmationMailSent ? 'confirmation sent' : 'no confirmation mail'}
      </Banner>
      {created.warnings.map((warning) => (
        <p key={warning} className="text-xs text-fg-2">
          {WARNINGS[warning] ?? warning}
        </p>
      ))}
      <ul className="grid gap-1 text-sm">
        {shipment.trackingUrls.map((url, index) => (
          <li key={url}>
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex gap-1 underline">
              <Icon icon={ExternalLink} size={14} />
              Tracking parcel {index + 1}
            </a>
          </li>
        ))}
        {shipment.returnTrackingUrls.map((url, index) => (
          <li key={url}>
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex gap-1 underline">
              <Icon icon={RotateCcw} size={14} />
              Return parcel {index + 1}
            </a>
          </li>
        ))}
      </ul>
      <div>
        <Button icon={Download} onClick={() => void openDownload(created.label)}>
          Download label
        </Button>
      </div>
    </div>
  )
}

/**
 * Shipment options + **Create shipment** (SCREENS.md §5.5 steps 3–4, API.md §6.6): include a
 * return label (disabled without old items), combine into one parcel, send the confirmation.
 * Carrier failures (`502 carrier_error`) show the carrier message with "Try again".
 */
export function ShipmentForm({
  srId,
  version,
  hasOldItems,
  ready,
  blockedReason,
  onCreated,
  shortcut = true,
}: {
  srId: number
  version?: number
  hasOldItems: boolean
  /** All new devices packed and `ship` available. */
  ready: boolean
  blockedReason?: string | null
  onCreated: (created: ShipmentCreated) => void
  shortcut?: boolean
}) {
  const [returnLabel, setReturnLabel] = useState(true)
  const [combined, setCombined] = useState(false)
  const [confirmation, setConfirmation] = useState(true)
  const create = useCreateShipment(srId)
  const submit = () => {
    if (!ready || create.isPending) return
    // mutateAsync: the request leaves the ready list on success (this form unmounts), so the
    // result must reach the parent through the promise, not a per-call callback.
    create
      .mutateAsync({
        includeReturnLabel: hasOldItems && returnLabel,
        combinedParcel: combined,
        sendConfirmation: confirmation,
        ...(version !== undefined ? { version } : {}),
      })
      .then((created) => {
        onCreated(created)
        void openDownload(created.label).catch(() => undefined)
      })
      .catch(() => undefined) // shown in the banner below
  }
  useShortcut('mod+enter', submit, {
    enabled: shortcut && ready,
    description: 'Create shipment',
    group: 'Parcel shipping',
    allowInInput: true,
    allowInDialog: true,
  })
  const error = create.error
  return (
    <div className="grid gap-3" data-testid="shipment-form">
      <div className="grid gap-2">
        <Switch
          checked={hasOldItems && returnLabel}
          disabled={!hasOldItems}
          onCheckedChange={setReturnLabel}
          label="Include return label"
        />
        {!hasOldItems && (
          <p className="pl-9 text-xs text-fg-3">No old devices to collect, so no return label.</p>
        )}
        <Switch checked={combined} onCheckedChange={setCombined} label="Single combined parcel" />
        <Switch
          checked={confirmation}
          onCheckedChange={setConfirmation}
          label="Send shipping confirmation"
        />
      </div>
      {error && (
        <Banner
          tone="critical"
          icon={OctagonX}
          title={
            isApiError(error) && error.code === 'carrier_error'
              ? 'The carrier rejected the shipment'
              : isApiError(error)
                ? error.title
                : 'The shipment could not be created'
          }
          actions={
            <Button size="sm" onClick={submit} loading={create.isPending}>
              Try again
            </Button>
          }
        >
          {isApiError(error) ? (error.guard?.message ?? error.detail) : null}
        </Banner>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={PackageCheck}
          disabled={!ready}
          loading={create.isPending}
          onClick={submit}
          title={!ready ? (blockedReason ?? 'Pack every new device first.') : undefined}
        >
          Create shipment
        </Button>
        {shortcut && ready && (
          <span className="text-xs text-fg-3">
            <Kbd>Ctrl</Kbd> <Kbd>⏎</Kbd>
          </span>
        )}
        {!ready && (
          <span className="text-xs text-fg-3">
            {blockedReason ?? 'Pack every new device first.'}
          </span>
        )}
      </div>
    </div>
  )
}
