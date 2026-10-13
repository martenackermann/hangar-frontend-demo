import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  Pause,
  RotateCcw,
  Truck,
  MapPin,
  Store,
  UserRoundCheck,
  Wrench,
} from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import {
  AgingIndicator,
  CopyableId,
  IdInk,
  StageLine,
  StatusBadge,
  STAGE_SLA_DAYS,
  computeAging,
} from '@/components/domain/status'
import { FlagBadge, ToneBadge } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { KeyValue, KeyValues } from '@/components/ui/page'
import { detailQueries } from '@/lib/api/details'
import type { DeliveryType, PipelineStage, ServiceRequestDetail } from '@/lib/api/types'
import { hasPermission } from '@/lib/auth/permissions'
import { useMe, usePermissions } from '@/lib/auth/store'
import { enumLabel, findEnumValue, useEnums } from '@/lib/enums'
import { formatDate, formatDateTime, formatFullDateTime } from '@/lib/format'
import { SR_DRAWER_TABS } from '@/lib/registry'
import { preloadComponents } from '@/lib/registry/lazy'
import { pushRecent } from '@/components/app/command-palette-store'
import { DrawerFrame, DrawerTabs, type DrawerNav, type DrawerTab } from './drawer-frame'
import { DrawerError, DrawerLoading } from './drawer-states'
import {
  usePrefetchNeighbours,
  useDrawerNavigation,
  useDrawerSearch,
  useSiblings,
} from './drawer-state'
import { WorkflowActionBar } from './workflow-actions'

const DELIVERY_ICONS: Record<DeliveryType, typeof Truck> = {
  technician: UserRoundCheck,
  parcel_to_user: Truck,
  parcel_to_pickup_point: Store,
}

/** One sentence per status: what to do next (DESIGN.md §10 Drawer "Next step"). */
const NEXT_STEP: Partial<Record<string, string>> = {
  imported: 'Send the booking invitation so the employee can pick a date.',
  imported_vip: 'VIP request: handle personally, or release it to the standard flow.',
  hardware_unavailable: 'Waiting for hardware. Release the hold when stock arrives.',
  invited: 'Waiting for the employee to book. The next reminder goes out automatically.',
  campus_info_sent: 'A technician calls the employee to agree on a date.',
  reminder_1_sent: 'Still no appointment. Reminder 2 follows if nothing happens.',
  reminder_2_sent: 'Last reminder sent. Escalate if the employee does not react.',
  escalated: 'Escalated. Follow up with the employee or the escalation contact.',
  appointment_booked: 'Claim the request and assign devices from staging, oldest first.',
  personalization_in_progress: 'Assign every new device by scanning, then finish personalization.',
  personalization_done: 'Check the software list and close the order.',
  ready_for_picking: 'Hand the devices to the technician or pack the parcel.',
  shipped: 'Parcel on its way. The technician completes the deployment on site.',
  provided: 'With the technician. Complete the deployment on site.',
  reschedule_needed: 'Book a new appointment with the employee.',
}

function stations(sr: ServiceRequestDetail): { stage: PipelineStage; date: string | null }[] {
  return [
    { stage: 'imported', date: sr.importedAt },
    { stage: 'invited', date: sr.communicationDate },
    { stage: 'booked', date: sr.appointmentStartAt },
    { stage: 'personalizing', date: sr.claimedAt ?? sr.milestones.personalizedAt },
    { stage: 'ready', date: sr.milestones.orderClosedAt },
    { stage: 'delivery', date: sr.milestones.shippedAt ?? sr.milestones.providedAt },
    { stage: 'deployed', date: sr.milestones.completedAt },
    { stage: 'closed', date: sr.milestones.cancelledAt },
  ]
}

function SrHead({ sr }: { sr: ServiceRequestDetail }) {
  const enums = useEnums()
  const status = findEnumValue(enums, 'serviceRequestStatus', sr.status)
  const stageIndex = enums.pipelineStage.findIndex((s) => s.value === sr.stage) + 1
  const sla = STAGE_SLA_DAYS[sr.stage]
  const aging = computeAging(sr.statusChangedAt, sr.stage)
  const DeliveryIcon = sr.deliveryType ? DELIVERY_ICONS[sr.deliveryType] : MapPin
  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className="text-[21px] leading-7 font-semibold">
          <CopyableId value={sr.number} />
        </span>
        {sr.taskNumber && (
          <span className="ml-auto text-xs text-fg-3">
            <IdInk value={sr.taskNumber} className="text-fg-2" />
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-2">
        <b className="text-lg font-semibold">{sr.contact.displayName}</b>
        <span className="text-fg-3">{sr.catalogItem ?? sr.shortDescription}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge
          entity="serviceRequestStatus"
          state={sr.status}
          variant="wash"
          since={sr.statusChangedAt}
        />
        {sr.deliveryType && (
          <FlagBadge icon={DeliveryIcon}>
            {enumLabel(enums, 'deliveryType', sr.deliveryType)}
          </FlagBadge>
        )}
        {sr.region && (
          <FlagBadge icon={MapPin}>
            {sr.region.name}
            {sr.supplyingSite ? ` → ${sr.supplyingSite.name}` : ''}
          </FlagBadge>
        )}
        {sr.isCampus && <FlagBadge icon={Building2}>Campus</FlagBadge>}
        {sr.isVip && <FlagBadge>VIP</FlagBadge>}
        {sr.osReinstall && <FlagBadge icon={RotateCcw}>OS reinstall</FlagBadge>}
        {(sr.communicationPaused || sr.communicationResumeDate) && (
          <FlagBadge icon={Pause}>
            {sr.communicationResumeDate
              ? `Paused until ${formatDate(sr.communicationResumeDate)}`
              : 'Paused'}
          </FlagBadge>
        )}
        {sr.attention.map((flag) => (
          <ToneBadge
            key={flag}
            tone={findEnumValue(enums, 'attentionFlag', flag)?.tone ?? 'caution'}
          >
            {enumLabel(enums, 'attentionFlag', flag)}
          </ToneBadge>
        ))}
      </div>
      <StageLine
        current={sr.stage}
        tone={status?.tone ?? 'intake'}
        stations={stations(sr)}
        header={
          <>
            <span>
              <b className="font-semibold">
                {findEnumValue(enums, 'pipelineStage', sr.stage)?.label}
              </b>
              <span className="text-fg-3">
                {' '}
                · stage {stageIndex} of {enums.pipelineStage.length}
              </span>
            </span>
            <span className="flex items-center gap-1 text-fg-3">
              in stage <AgingIndicator since={sr.statusChangedAt} stage={sr.stage} />
              {sla ? ` · SLA ${sla}d` : ''}
              <span className="sr-only">{aging.level}</span>
            </span>
          </>
        }
      />
      {sr.appointmentStartAt && (
        <p className="text-xs text-fg-2">
          Appointment {formatDateTime(sr.appointmentStartAt)}
          {sr.appointmentCalendarName ? ` · ${sr.appointmentCalendarName}` : ''}
        </p>
      )}
    </>
  )
}

function NextStep({ sr, actions }: { sr: ServiceRequestDetail; actions: ReactNode }) {
  const text = NEXT_STEP[sr.status]
  if (!text && sr.availableActions.length === 0) return null
  return (
    <div className="flex gap-2.5 rounded-sm border border-[color-mix(in_srgb,var(--hg-accent-line)_35%,transparent)] bg-accent-wash p-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-accent text-fg-on-accent">
        <Icon icon={Wrench} />
      </span>
      <div className="grid min-w-0 flex-1 gap-2">
        <p className="text-xs text-fg-2">{text ?? 'Choose the next action.'}</p>
        {actions}
      </div>
    </div>
  )
}

/** Fallback while no slice has registered SR drawer tabs: the core key facts. */
function CoreFacts({ sr }: { sr: ServiceRequestDetail }) {
  const enums = useEnums()
  return (
    <KeyValues>
      <KeyValue label="Catalog item">{sr.catalogItem}</KeyValue>
      <KeyValue label="Procurement type">
        {enumLabel(enums, 'procurementType', sr.procurementType)}
      </KeyValue>
      <KeyValue label="Scope of delivery">{sr.scopeOfDelivery}</KeyValue>
      <KeyValue label="ITSM state">{sr.itsmState}</KeyValue>
      <KeyValue label="Assignment group">{sr.assignmentGroup}</KeyValue>
      <KeyValue label="Cost centre">{sr.costCenter}</KeyValue>
      <KeyValue label="Opened">{formatFullDateTime(sr.openedAt)}</KeyValue>
      <KeyValue label="Imported">{formatFullDateTime(sr.importedAt)}</KeyValue>
      <KeyValue label="Requested devices" full>
        {sr.newItemTypes.join(', ')}
      </KeyValue>
      <KeyValue label="Short description" full>
        {sr.shortDescription}
      </KeyValue>
    </KeyValues>
  )
}

export function SrDrawer({ id }: { id: number }) {
  const me = useMe()
  const permissions = usePermissions()
  const { tab } = useDrawerSearch()
  const drawer = useDrawerNavigation()
  const siblings = useSiblings('sr')
  const query = useQuery(detailQueries.serviceRequest(id))
  useEffect(() => preloadComponents(SR_DRAWER_TABS), [])
  const sr = query.data

  const recentNumber = sr?.number
  const recentName = sr?.contact.displayName
  useEffect(() => {
    if (recentNumber === undefined) return
    pushRecent(me?.id, {
      kind: 'service_request',
      id,
      title: recentNumber,
      subtitle: recentName,
      href: `/service-requests?sr=${id}`,
    })
  }, [id, recentNumber, recentName, me?.id])

  const index = siblings.indexOf(id)
  usePrefetchNeighbours(siblings, index, detailQueries.serviceRequest)
  const nav: DrawerNav | undefined =
    index >= 0
      ? {
          position: index + 1,
          total: siblings.length,
          onPrev: index > 0 ? () => drawer.move('sr', siblings[index - 1] ?? id) : undefined,
          onNext:
            index < siblings.length - 1
              ? () => drawer.move('sr', siblings[index + 1] ?? id)
              : undefined,
        }
      : undefined

  if (!sr) {
    return (
      <DrawerFrame label="Service request" onClose={drawer.close} nav={nav}>
        {query.isError ? (
          <DrawerError error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <DrawerLoading />
        )}
      </DrawerFrame>
    )
  }

  const tabs: DrawerTab[] = SR_DRAWER_TABS.filter(
    (descriptor) =>
      hasPermission(permissions, descriptor.permission) && (descriptor.isVisible?.(sr) ?? true),
  ).map((descriptor) => ({
    id: descriptor.id,
    label: descriptor.label,
    count: descriptor.count?.(sr),
    content: <descriptor.component entity={sr} />,
  }))
  if (tabs.length === 0)
    tabs.push({ id: 'overview', label: 'Overview', content: <CoreFacts sr={sr} /> })

  return (
    <DrawerFrame
      label={`Service request ${sr.number}`}
      onClose={drawer.close}
      nav={nav}
      head={<SrHead key={sr.id} sr={sr} />}
      nextStep={
        <NextStep
          key={sr.id}
          sr={sr}
          actions={<WorkflowActionBar resource="serviceRequest" entity={sr} label={sr.number} />}
        />
      }
    >
      <DrawerTabs key={sr.id} tabs={tabs} value={tab} onValueChange={drawer.setTab} />
    </DrawerFrame>
  )
}
