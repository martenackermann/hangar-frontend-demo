import { Building2, CalendarClock, MessageSquare, Pause } from 'lucide-react'
import type { DataColumn } from '@/components/data-table/data-table'
import { IdInk, StatusBadge, VipFlag } from '@/components/domain/status'
import { FlagBadge, ToneBadge } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import type { EnumsResponse, LeaseReturnListItem } from '@/lib/api/types'
import { enumLabel, findEnumValue } from '@/lib/enums'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { isPaused } from './sr-columns'

export function retirementText(days: number): string {
  if (days === 0) return 'today'
  return days > 0 ? `in ${days} days` : `${-days} days overdue`
}

/** caution ≤ 14 days, critical once passed (SCREENS.md §4.2). */
export function retirementTone(days: number): 'critical' | 'caution' | null {
  if (days < 0) return 'critical'
  return days <= 14 ? 'caution' : null
}

function Retirement({ lease }: { lease: LeaseReturnListItem }) {
  const tone = retirementTone(lease.daysUntilRetirement)
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
      <span>{formatDate(lease.retirementDate, { year: false })}</span>
      <span
        className={cn(
          'text-xs',
          tone === 'critical' && 'font-medium text-tone-critical-fg',
          tone === 'caution' && 'text-tone-caution-fg',
          !tone && 'text-fg-3',
        )}
      >
        {retirementText(lease.daysUntilRetirement)}
      </span>
    </span>
  )
}

/**
 * Lease return table columns (SCREENS.md §4.2). The linked SR cell is a button that opens the SR
 * drawer (`onOpenSr`) without opening the lease row.
 */
export function leaseColumns(
  enums: EnumsResponse,
  onOpenSr: (id: number) => void,
): DataColumn<LeaseReturnListItem>[] {
  return [
    {
      id: 'assetTag',
      header: 'Asset tag',
      sortField: 'assetTag',
      width: 132,
      locked: true,
      pinned: true,
      title: (lease) => lease.serialNumber ?? lease.assetTag,
      cell: (lease) => <IdInk value={lease.assetTag} />,
    },
    {
      id: 'serial',
      header: 'Serial',
      width: 130,
      defaultHidden: true,
      cell: (lease) =>
        lease.serialNumber ? <IdInk value={lease.serialNumber} whole /> : <span className="text-fg-disabled">—</span>,
    },
    {
      id: 'model',
      header: 'Model',
      width: 190,
      title: (lease) => [lease.model, lease.modelCategory].filter(Boolean).join(' · '),
      cell: (lease) => (
        <span className="truncate">
          {lease.model ?? '—'}
          {lease.modelCategory && <span className="text-xs text-fg-3"> · {lease.modelCategory}</span>}
        </span>
      ),
    },
    {
      id: 'user',
      header: 'Employee',
      width: 180,
      title: (lease) => `${lease.contact?.displayName ?? lease.userId} · ${lease.userId}`,
      cell: (lease) => (
        <span className="truncate font-medium">{lease.contact?.displayName ?? lease.userId}</span>
      ),
    },
    {
      id: 'retirement',
      header: 'Retirement',
      sortField: 'retirementDate',
      width: 170,
      cell: (lease) => <Retirement lease={lease} />,
    },
    {
      id: 'status',
      header: 'Status',
      sortField: 'status',
      width: 200,
      cell: (lease) => (
        <StatusBadge entity="leaseReturnStatus" state={lease.status} since={lease.statusChangedAt} />
      ),
    },
    {
      id: 'lastMail',
      header: 'Last mail',
      sortField: 'communicationDate',
      width: 120,
      cell: (lease) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {lease.communicationDate ? formatDate(lease.communicationDate, { year: false }) : '—'}
          {isPaused(lease) && (
            <span
              title={
                lease.communicationResumeDate && !lease.communicationPaused
                  ? `Paused until ${formatDate(lease.communicationResumeDate)}`
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
      id: 'linkedSr',
      header: 'Linked SR',
      width: 220,
      cell: (lease) =>
        lease.serviceRequest ? (
          <button
            type="button"
            className="inline-flex min-w-0 items-center gap-1.5 rounded-xs hover:underline"
            title="Open service request"
            onClick={(event) => {
              event.stopPropagation()
              if (lease.serviceRequest) onOpenSr(lease.serviceRequest.id)
            }}
          >
            <IdInk value={lease.serviceRequest.number} />
            <StatusBadge entity="serviceRequestStatus" state={lease.serviceRequest.status} size="sm" />
          </button>
        ) : (
          <span className="text-fg-disabled">—</span>
        ),
    },
    {
      id: 'comments',
      header: 'Comments',
      width: 92,
      align: 'end',
      cell: (lease) =>
        lease.commentCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-fg-2">
            <Icon icon={MessageSquare} size={12} className="text-fg-3" />
            {lease.commentCount}
          </span>
        ) : null,
    },
    {
      id: 'flags',
      header: 'Flags',
      width: 190,
      cell: (lease) => (
        <span className="flex min-w-0 items-center gap-1 overflow-hidden">
          {lease.isVip && <VipFlag />}
          {lease.isCampus && <FlagBadge icon={Building2}>Campus</FlagBadge>}
          {lease.attention.slice(0, 2).map((flag) => (
            <ToneBadge key={flag} tone={findEnumValue(enums, 'attentionFlag', flag)?.tone ?? 'caution'}>
              {enumLabel(enums, 'attentionFlag', flag)}
            </ToneBadge>
          ))}
          {lease.attention.length > 2 && (
            <span className="text-xs text-fg-3">+{lease.attention.length - 2}</span>
          )}
        </span>
      ),
    },
  ]
}

/** Phone row: asset tag · retirement / name / status. */
export function leaseMobileRow(lease: LeaseReturnListItem) {
  const tone = retirementTone(lease.daysUntilRetirement)
  return (
    <div className="grid gap-0.5">
      <div className="flex items-center gap-2 text-xs">
        <IdInk value={lease.assetTag} />
        <span className="text-fg-3">{lease.model}</span>
        <span className={cn('ml-auto inline-flex items-center gap-1', tone === 'critical' ? 'text-tone-critical-fg' : 'text-fg-3')}>
          <Icon icon={CalendarClock} size={12} />
          {retirementText(lease.daysUntilRetirement)}
        </span>
      </div>
      <div className="font-medium">{lease.contact?.displayName ?? lease.userId}</div>
      <div className="flex items-center gap-2 text-xs">
        <StatusBadge entity="leaseReturnStatus" state={lease.status} size="sm" />
        {lease.serviceRequest && <IdInk value={lease.serviceRequest.number} />}
      </div>
    </div>
  )
}
