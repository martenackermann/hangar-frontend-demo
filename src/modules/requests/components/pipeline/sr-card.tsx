import {
  Building2,
  CalendarClock,
  CalendarDays,
  Mail,
  MoreHorizontal,
  Pause,
  RotateCcw,
  Store,
  Truck,
  UserRoundCheck,
} from 'lucide-react'
import { forwardRef, useState } from 'react'
import { PipelineCard, PipelineCardFooter } from '@/components/domain/pipeline-board'
import { AgingIndicator, IdInk, StatusBadge, VipFlag } from '@/components/domain/status'
import { useWorkflowAction } from '@/components/drawer/workflow-actions'
import { IconButton } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, FlagBadge, ToneBadge } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import type { DeliveryType, ServiceRequestListItem } from '@/lib/api/types'
import { actionLabel, enumLabel, findEnumValue, findTransition, useEnums } from '@/lib/enums'
import { findActionDialog } from '@/lib/registry'
import { businessToday, formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const DELIVERY_ICONS: Record<DeliveryType, typeof Truck> = {
  technician: UserRoundCheck,
  parcel_to_user: Truck,
  parcel_to_pickup_point: Store,
}
/** Statuses whose badge is the card's exception (caution / critical tones render washed). */
const EXCEPTION = new Set(['hardware_unavailable', 'escalated', 'reschedule_needed', 'imported_vip'])
const FRESH_MS = 2 * 60_000

function when(sr: ServiceRequestListItem) {
  if (sr.appointmentStartAt) {
    return { icon: CalendarDays, text: formatDateTime(sr.appointmentStartAt) }
  }
  if (sr.communicationResumeDate && sr.communicationResumeDate > businessToday()) {
    return { icon: Pause, text: `Paused until ${formatDate(sr.communicationResumeDate, { year: false })}` }
  }
  if (sr.communicationDate) {
    return { icon: Mail, text: `Last mail ${formatDate(sr.communicationDate, { year: false })}` }
  }
  return null
}

/** Quick actions on hover/focus (SCREENS.md §3.1): simple actions post directly; actions with a
 * dialog, a required comment or a destructive effect open the drawer's action bar instead. */
function QuickActions({
  sr,
  onOpen,
}: {
  sr: ServiceRequestListItem
  onOpen: () => void
}) {
  const enums = useEnums()
  const mutation = useWorkflowAction('serviceRequest', sr, sr.number)
  const [open, setOpen] = useState(false)
  const actions = sr.availableActions.filter((action) => action !== 'ship')
  if (actions.length === 0) return null
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={MoreHorizontal}
          label={`Actions for ${sr.number}`}
          size="sm"
          className={cn(
            'size-6 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
            open && 'opacity-100',
          )}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuLabel>{sr.number}</DropdownMenuLabel>
        {actions.map((action) => {
          const def = findTransition(enums, 'serviceRequest', action)
          const needsDrawer =
            Boolean(findActionDialog('serviceRequest', action)) ||
            def?.requiresComment ||
            def?.destructive
          return (
            <DropdownMenuItem
              key={action}
              destructive={def?.destructive}
              onSelect={() => {
                if (needsDrawer) onOpen()
                else mutation.mutate({ action })
              }}
            >
              {actionLabel(enums, 'serviceRequest', action)}
              {needsDrawer ? '…' : ''}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const SrCard = forwardRef<
  HTMLDivElement,
  {
    sr: ServiceRequestListItem
    selected: boolean
    initialFocus?: boolean
    onOpen: () => void
  }
>(function SrCard({ sr, selected, initialFocus, onOpen }, ref) {
  const enums = useEnums()
  const status = findEnumValue(enums, 'serviceRequestStatus', sr.status)
  const tone = status?.tone ?? 'intake'
  const exception =
    EXCEPTION.has(sr.status) || tone === 'caution' || tone === 'critical'
  const firstFlag = sr.attention[0]
  const moment = when(sr)
  const fresh = Date.now() - Date.parse(sr.statusChangedAt) < FRESH_MS
  const DeliveryIcon = sr.deliveryType ? DELIVERY_ICONS[sr.deliveryType] : null
  const paused =
    sr.communicationPaused ||
    (sr.communicationResumeDate !== null && sr.communicationResumeDate > businessToday())

  return (
    <PipelineCard
      ref={ref}
      selected={selected}
      fresh={fresh}
      initialFocus={initialFocus}
      onOpen={onOpen}
      aria-label={`${sr.number}, ${sr.contact.displayName}, ${status?.label ?? sr.status}`}
      className="group"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <IdInk value={sr.number} className="text-xs" />
        {sr.editor && sr.stage === 'personalizing' && (
          <Avatar name={sr.editor.displayName} size={18} tone="workshop" />
        )}
        <span className="ml-auto flex items-center gap-0.5">
          <AgingIndicator since={sr.statusChangedAt} stage={sr.stage} />
          <QuickActions sr={sr} onOpen={onOpen} />
        </span>
      </div>
      <div className="truncate text-[13px] font-medium text-fg">{sr.contact.displayName}</div>
      {sr.newItemTypes[0] && (
        <div className="truncate text-xs text-fg-2" title={sr.newItemTypes.join(', ')}>
          {sr.newItemTypes[0]}
          {sr.newItemTypes.length > 1 && (
            <span className="text-fg-3"> +{sr.newItemTypes.length - 1}</span>
          )}
        </div>
      )}
      <div className="flex min-w-0 items-center gap-1 text-xs text-fg-2">
        <span className="truncate">{sr.region?.name ?? 'Region unresolved'}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {sr.isCampus && <FlagBadge icon={Building2}>Campus</FlagBadge>}
          {sr.isVip && <VipFlag />}
          {paused && (
            <span title="Communication paused" className="text-fg-3">
              <Icon icon={Pause} size={12} />
              <span className="sr-only">Communication paused</span>
            </span>
          )}
        </span>
      </div>
      {(exception || firstFlag || moment || DeliveryIcon) && (
        <PipelineCardFooter>
          {exception ? (
            <StatusBadge entity="serviceRequestStatus" state={sr.status} variant="wash" size="sm" />
          ) : firstFlag ? (
            <ToneBadge tone={findEnumValue(enums, 'attentionFlag', firstFlag)?.tone ?? 'caution'}>
              {enumLabel(enums, 'attentionFlag', firstFlag)}
              {sr.attention.length > 1 ? ` +${sr.attention.length - 1}` : ''}
            </ToneBadge>
          ) : (
            <StatusBadge entity="serviceRequestStatus" state={sr.status} size="sm" />
          )}
          {moment ? (
            <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap">
              <Icon icon={moment.icon} size={12} className="text-fg-3" />
              <span className="truncate">{moment.text}</span>
            </span>
          ) : (
            DeliveryIcon &&
            sr.deliveryType && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <Icon icon={DeliveryIcon} size={12} className="text-fg-3" />
                {enumLabel(enums, 'deliveryType', sr.deliveryType)}
              </span>
            )
          )}
          {sr.status === 'reschedule_needed' && !sr.appointmentStartAt && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-fg-3">
              <Icon icon={CalendarClock} size={12} /> needs a new date
            </span>
          )}
          {sr.status === 'imported' && !sr.communicationDate && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-fg-3">
              <Icon icon={RotateCcw} size={12} /> imported {formatDate(sr.importedAt, { year: false })}
            </span>
          )}
        </PipelineCardFooter>
      )}
    </PipelineCard>
  )
})
