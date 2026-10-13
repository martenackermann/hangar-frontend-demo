import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PackageOpen, PanelRightOpen, Wrench } from 'lucide-react'
import { useState } from 'react'
import { CopyableId, IdInk, StatusBadge } from '@/components/domain/status'
import { useDrawerNavigation } from '@/components/drawer/drawer-state'
import { DrawerError } from '@/components/drawer/drawer-states'
import { useWorkflowAction } from '@/components/drawer/workflow-actions'
import { ScanStation } from '@/components/scan/scan-station'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState, FlagBadge, Skeleton } from '@/components/ui/feedback'
import { SectionHeading } from '@/components/ui/page'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { detailQueries } from '@/lib/api/details'
import { assetKeys, srKeys } from '@/lib/api/keys'
import type {
  ItemSlot,
  OsReinstallTiming,
  ServiceRequestDetail,
  ServiceRequestItem,
} from '@/lib/api/types'
import { useCan, useMe } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { useShortcut } from '@/lib/shortcuts'
import { scanAssignment, usePatchStaging, useUnassign } from '@/modules/staging/api'
import { Appointment } from './appointment'
import { SlotCard } from './slot-card'
import { SoftwareTags } from './software-tags'
import { StagingActions } from './staging-actions'

type OsChoice = OsReinstallTiming | 'none'

const OS_OPTIONS: { value: OsChoice; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'on_pickup', label: 'On pickup' },
  { value: 'on_delivery', label: 'On delivery' },
]

const PANEL_ACTIONS = [
  'claim',
  'finish_personalization',
  'skip_preparation',
  'reopen_personalization',
  'release',
] as const

const EDITABLE: readonly string[] = [
  'appointment_booked',
  'personalization_in_progress',
  'personalization_done',
]

/**
 * Personalization work panel (SCREENS.md §5.2, right pane): header + actions, one card per new
 * slot (FIFO suggestion), compact scan field posting to the focused slot, OS reinstall and added
 * software, items to collect.
 */
export function PersonalizationPanel({ srId }: { srId: number }) {
  const query = useQuery(detailQueries.serviceRequest(srId))
  if (query.isPending) {
    return (
      <div className="grid gap-3 p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }
  if (query.isError) return <DrawerError error={query.error} onRetry={() => void query.refetch()} />
  return <Panel sr={query.data} />
}

function Panel({ sr }: { sr: ServiceRequestDetail }) {
  const enums = useEnums()
  const me = useMe()
  const queryClient = useQueryClient()
  const drawer = useDrawerNavigation()
  const canPersonalize = useCan('staging.personalize')
  const action = useWorkflowAction('serviceRequest', sr, sr.number)
  const unassign = useUnassign(sr.id)
  const patch = usePatchStaging(sr.id)
  const [focusedSlot, setFocusedSlot] = useState<ItemSlot | null>(null)
  const [confirmSkip, setConfirmSkip] = useState(false)

  const newItems = sr.items.filter((item) => item.direction === 'deliver')
  const oldItems = sr.items.filter((item) => item.direction === 'collect')
  const editing =
    canPersonalize && sr.status === 'personalization_in_progress' && sr.editor?.id === me?.id
  const optionsEditable =
    canPersonalize &&
    EDITABLE.includes(sr.status) &&
    (sr.status !== 'personalization_in_progress' || sr.editor?.id === me?.id)
  const firstOpen = newItems.find((item) => item.asset === null)?.slot ?? newItems[0]?.slot
  const slot =
    focusedSlot && newItems.some((item) => item.slot === focusedSlot) ? focusedSlot : firstOpen

  const nextOpenAfter = (current: ItemSlot, items: readonly ServiceRequestItem[]) =>
    items.find(
      (item) => item.direction === 'deliver' && item.asset === null && item.slot !== current,
    )?.slot

  const run = (name: string) => {
    if (sr.availableActions.includes(name)) action.mutate({ action: name })
  }
  const skipAllowed = sr.availableActions.includes('skip_preparation')
  useShortcut('c', () => run('claim'), { description: 'Claim', group: 'Personalization' })
  useShortcut('f', () => run('finish_personalization'), {
    description: 'Finish personalization',
    group: 'Personalization',
  })
  useShortcut('s', () => skipAllowed && setConfirmSkip(true), {
    description: 'Skip preparation',
    group: 'Personalization',
  })
  useShortcut('alt+c', () => run('claim'), { allowInInput: true, group: 'Personalization' })
  useShortcut('alt+f', () => run('finish_personalization'), {
    allowInInput: true,
    group: 'Personalization',
  })
  useShortcut('alt+s', () => skipAllowed && setConfirmSkip(true), {
    allowInInput: true,
    group: 'Personalization',
  })

  const os: OsChoice = sr.osReinstall ?? 'none'

  return (
    <div className="grid content-start gap-4 p-4" data-testid="work-panel">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CopyableId value={sr.number} />
          <StatusBadge entity="serviceRequestStatus" state={sr.status} withTrack />
          {sr.editor && (
            <FlagBadge icon={Wrench}>
              {sr.editor.id === me?.id ? 'You are editing' : `Editing: ${sr.editor.displayName}`}
            </FlagBadge>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={PanelRightOpen}
            className="ml-auto"
            onClick={() => drawer.open('sr', sr.id, 'staging')}
          >
            Details
          </Button>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-2">
          <span className="font-medium text-fg">{sr.contact.displayName}</span>
          <Appointment startAt={sr.appointmentStartAt} absolute />
          {sr.deliveryType && <span>{enumLabel(enums, 'deliveryType', sr.deliveryType)}</span>}
          {sr.region && <span>{sr.region.name}</span>}
        </p>
        <StagingActions
          entity={sr}
          actions={PANEL_ACTIONS}
          confirm={{ skip_preparation: () => setConfirmSkip(true) }}
        />
      </header>

      <div>
        <SectionHeading>Items to deliver</SectionHeading>
        {newItems.length === 0 ? (
          <p className="text-sm text-fg-2">
            No new devices: this request only collects old hardware. Skip preparation.
          </p>
        ) : (
          <div className="grid gap-2">
            {newItems.map((item) => (
              <SlotCard
                key={item.slot}
                srId={sr.id}
                item={item}
                focused={editing && item.slot === slot}
                canEdit={editing}
                onFocus={() => setFocusedSlot(item.slot)}
                onUnassign={() => {
                  unassign.mutate(item.slot)
                  setFocusedSlot(item.slot)
                }}
                unassigning={unassign.isPending && unassign.variables === item.slot}
              />
            ))}
          </div>
        )}
      </div>

      {editing && slot && (
        <div className="rounded-sm border border-line bg-surface" data-testid="assign-scan">
          <ScanStation
            compact
            label={`Scan device for ${enumLabel(enums, 'itemSlot', slot)}`}
            camera
            submit={(serial) => scanAssignment(sr.id, slot, serial)}
            onResult={(result) => {
              if (!result.applied) return
              void queryClient.invalidateQueries({ queryKey: srKeys.all })
              void queryClient.invalidateQueries({ queryKey: assetKeys.all })
              const updated = sr.items.map((item) =>
                item.slot === slot ? { ...item, asset: result.entity?.asset ?? null } : item,
              )
              const next = nextOpenAfter(slot, updated)
              if (next) setFocusedSlot(next)
            }}
            onUndone={() => {
              void queryClient.invalidateQueries({ queryKey: srKeys.all })
              void queryClient.invalidateQueries({ queryKey: assetKeys.all })
            }}
          />
        </div>
      )}

      <div>
        <SectionHeading>Options</SectionHeading>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-fg-2">OS reinstall</span>
            {optionsEditable ? (
              <SegmentedControl<OsChoice>
                label="OS reinstall"
                value={os}
                options={OS_OPTIONS}
                onValueChange={(value) =>
                  patch.mutate({
                    osReinstall: value === 'none' ? null : value,
                    version: sr.version,
                  })
                }
              />
            ) : (
              <span className="text-sm">{OS_OPTIONS.find((o) => o.value === os)?.label}</span>
            )}
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm text-fg-2">Added software</span>
            <SoftwareTags
              value={sr.addedSoftware}
              disabled={!optionsEditable}
              onChange={(next) => patch.mutate({ addedSoftware: next, version: sr.version })}
            />
            {sr.requestedSoftware.length > 0 && (
              <p className="text-xs text-fg-3">
                Requested in ITSM: {sr.requestedSoftware.join(', ')}
              </p>
            )}
          </div>
        </div>
      </div>

      <div>
        <SectionHeading>Items to collect</SectionHeading>
        {oldItems.length === 0 ? (
          <p className="text-sm text-fg-3">Nothing to collect.</p>
        ) : (
          <ul className="grid gap-1.5">
            {oldItems.map((item) => (
              <li key={item.slot} className="flex items-center gap-3 text-sm">
                <span className="w-36 text-fg-2">{enumLabel(enums, 'itemSlot', item.slot)}</span>
                <IdInk value={item.expectedAssetTag ?? item.asset?.assetTag} />
                {item.asset?.article && (
                  <span className="text-fg-3">{item.asset.article.name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirmSkip}
        onOpenChange={setConfirmSkip}
        title={`Skip preparation · ${sr.number}?`}
        description="The assigned devices go straight to goods-out without software preparation; the order is closed."
        confirmLabel="Skip preparation"
        pending={action.isPending}
        onConfirm={() =>
          action.mutate({ action: 'skip_preparation' }, { onSuccess: () => setConfirmSkip(false) })
        }
      />
    </div>
  )
}

export function EmptyPanel() {
  return (
    <EmptyState icon={PackageOpen} title="Select a request from the queue.">
      Claim it, then scan the devices into its slots, oldest stock first.
    </EmptyState>
  )
}
