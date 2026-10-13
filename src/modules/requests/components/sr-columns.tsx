import { Building2, Pause, Store, Truck, UserRoundCheck } from 'lucide-react'
import type { DataColumn } from '@/components/data-table/data-table'
import { AgingIndicator, IdInk, StatusBadge, VipFlag } from '@/components/domain/status'
import { Avatar, FlagBadge, ToneBadge } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import type { DeliveryType, EnumsResponse, ServiceRequestListItem } from '@/lib/api/types'
import { enumLabel, findEnumValue } from '@/lib/enums'
import { businessToday, formatDate, formatDateTime } from '@/lib/format'

const DELIVERY_ICONS: Record<DeliveryType, typeof Truck> = {
  technician: UserRoundCheck,
  parcel_to_user: Truck,
  parcel_to_pickup_point: Store,
}

export function isPaused(row: {
  communicationPaused: boolean
  communicationResumeDate: string | null
}): boolean {
  return (
    row.communicationPaused ||
    (row.communicationResumeDate !== null && row.communicationResumeDate > businessToday())
  )
}

/** Service request table columns (SCREENS.md §4.1; DESIGN.md §11.2 StageTrack status cells). */
export function srColumns(enums: EnumsResponse): DataColumn<ServiceRequestListItem>[] {
  return [
    {
      id: 'number',
      header: 'SR',
      sortField: 'number',
      width: 132,
      locked: true,
      pinned: true,
      title: (sr) => sr.taskNumber,
      cell: (sr) => <IdInk value={sr.number} />,
    },
    {
      id: 'status',
      header: 'Status',
      sortField: 'status',
      width: 270,
      cell: (sr) => (
        <span className="flex min-w-0 items-center gap-2">
          <StatusBadge
            entity="serviceRequestStatus"
            state={sr.status}
            withTrack
            since={sr.statusChangedAt}
          />
        </span>
      ),
    },
    {
      id: 'inStage',
      header: 'In stage',
      sortField: 'statusChangedAt',
      width: 84,
      cell: (sr) => <AgingIndicator since={sr.statusChangedAt} stage={sr.stage} />,
    },
    {
      id: 'user',
      header: 'Employee',
      width: 190,
      title: (sr) => `${sr.contact.displayName} · ${sr.contact.userId}`,
      cell: (sr) => <span className="truncate font-medium">{sr.contact.displayName}</span>,
    },
    {
      id: 'region',
      header: 'Region',
      sortField: 'region',
      width: 140,
      cell: (sr) =>
        sr.region ? (
          <span className="truncate">
            {sr.region.name}
            {sr.supplyingSite && (
              <span className="font-mono text-[11px] text-fg-3"> · {sr.supplyingSite.code}</span>
            )}
          </span>
        ) : (
          <ToneBadge tone="caution">Unresolved</ToneBadge>
        ),
    },
    {
      id: 'delivery',
      header: 'Delivery',
      width: 170,
      cell: (sr) =>
        sr.deliveryType ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Icon icon={DELIVERY_ICONS[sr.deliveryType]} size={14} className="text-fg-3" />
            <span className="truncate">{enumLabel(enums, 'deliveryType', sr.deliveryType)}</span>
          </span>
        ) : (
          <span className="text-fg-disabled">—</span>
        ),
    },
    {
      id: 'items',
      header: 'Items',
      width: 200,
      title: (sr) => sr.newItemTypes.join(', '),
      cell: (sr) => <span className="truncate text-fg-2">{sr.newItemTypes.join(', ') || '—'}</span>,
    },
    {
      id: 'appointment',
      header: 'Appointment',
      sortField: 'appointmentStartAt',
      width: 160,
      cell: (sr) =>
        sr.appointmentStartAt ? (
          <span className="whitespace-nowrap">{formatDateTime(sr.appointmentStartAt)}</span>
        ) : (
          <span className="text-fg-disabled">—</span>
        ),
    },
    {
      id: 'lastMail',
      header: 'Last mail',
      sortField: 'communicationDate',
      width: 128,
      cell: (sr) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {sr.communicationDate ? formatDate(sr.communicationDate, { year: false }) : '—'}
          {isPaused(sr) && (
            <span
              title={
                sr.communicationResumeDate && !sr.communicationPaused
                  ? `Paused until ${formatDate(sr.communicationResumeDate)}`
                  : 'Communication paused'
              }
            >
              <Icon icon={Pause} size={12} className="text-tone-caution" />
              <span className="sr-only">paused</span>
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'editor',
      header: 'Editor',
      width: 80,
      defaultHidden: true,
      cell: (sr) =>
        sr.editor ? <Avatar name={sr.editor.displayName} size={22} tone="workshop" /> : null,
    },
    {
      id: 'imported',
      header: 'Imported',
      sortField: 'importedAt',
      width: 120,
      defaultHidden: true,
      cell: (sr) => formatDate(sr.importedAt, { year: false }),
    },
    {
      id: 'flags',
      header: 'Flags',
      width: 190,
      cell: (sr) => (
        <span className="flex min-w-0 items-center gap-1 overflow-hidden">
          {sr.isVip && <VipFlag />}
          {sr.isCampus && <FlagBadge icon={Building2}>Campus</FlagBadge>}
          {sr.attention.slice(0, 2).map((flag) => (
            <ToneBadge
              key={flag}
              tone={findEnumValue(enums, 'attentionFlag', flag)?.tone ?? 'caution'}
            >
              {enumLabel(enums, 'attentionFlag', flag)}
            </ToneBadge>
          ))}
          {sr.attention.length > 2 && (
            <span className="text-xs text-fg-3">+{sr.attention.length - 2}</span>
          )}
        </span>
      ),
    },
    {
      id: 'procurement',
      header: 'Procurement',
      width: 140,
      defaultHidden: true,
      cell: (sr) => enumLabel(enums, 'procurementType', sr.procurementType),
    },
  ]
}

/** Phone row (DESIGN.md §11.2): SR · region · aging / name / status / appointment. */
export function srMobileRow(sr: ServiceRequestListItem) {
  return (
    <div className="grid gap-0.5">
      <div className="flex items-center gap-2 text-xs">
        <IdInk value={sr.number} />
        <span className="text-fg-3">{sr.region?.name ?? 'Unresolved'}</span>
        <span className="ml-auto">
          <AgingIndicator since={sr.statusChangedAt} stage={sr.stage} />
        </span>
      </div>
      <div className="font-medium">{sr.contact.displayName}</div>
      <div className="flex items-center gap-2 text-xs">
        <StatusBadge entity="serviceRequestStatus" state={sr.status} size="sm" />
        {sr.appointmentStartAt && (
          <span className="text-fg-3">{formatDateTime(sr.appointmentStartAt)}</span>
        )}
      </div>
    </div>
  )
}
