import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Link as LinkIcon, Pause } from 'lucide-react'
import { useEffect } from 'react'
import { pushRecent } from '@/components/app/command-palette-store'
import { CopyableId, IdInk, StatusBadge } from '@/components/domain/status'
import { FlagBadge, ToneBadge } from '@/components/ui/feedback'
import { KeyValue, KeyValues } from '@/components/ui/page'
import { detailQueries } from '@/lib/api/details'
import type { LeaseReturnDetail } from '@/lib/api/types'
import { hasPermission } from '@/lib/auth/permissions'
import { useMe, usePermissions } from '@/lib/auth/store'
import { enumLabel, findEnumValue, useEnums } from '@/lib/enums'
import { formatDate, formatFullDateTime } from '@/lib/format'
import { LEASE_DRAWER_TABS } from '@/lib/registry'
import { DrawerFrame, DrawerTabs, type DrawerNav, type DrawerTab } from './drawer-frame'
import { DrawerError, DrawerLoading } from './drawer-states'
import { useDrawerNavigation, useDrawerSearch, useSiblings } from './drawer-state'
import { WorkflowActionBar } from './workflow-actions'

function retirementText(days: number): string {
  if (days === 0) return 'retires today'
  return days > 0 ? `in ${days} days` : `${-days} days overdue`
}

function LeaseHead({ lr }: { lr: LeaseReturnDetail }) {
  const enums = useEnums()
  const tone =
    lr.daysUntilRetirement < 0 ? 'critical' : lr.daysUntilRetirement <= 14 ? 'caution' : null
  const drawer = useDrawerNavigation()
  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className="text-[21px] leading-7 font-semibold">
          <CopyableId value={lr.assetTag} />
        </span>
        {lr.serialNumber && (
          <IdInk value={lr.serialNumber} whole className="ml-auto text-xs text-fg-2" />
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-2">
        <b className="text-lg font-semibold">{lr.contact?.displayName ?? lr.userId}</b>
        <span className="text-fg-3">{lr.model}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge
          entity="leaseReturnStatus"
          state={lr.status}
          variant="wash"
          since={lr.statusChangedAt}
        />
        {tone ? (
          <ToneBadge tone={tone} icon={CalendarClock}>
            Retirement {formatDate(lr.retirementDate)} · {retirementText(lr.daysUntilRetirement)}
          </ToneBadge>
        ) : (
          <FlagBadge icon={CalendarClock}>
            Retirement {formatDate(lr.retirementDate)} · {retirementText(lr.daysUntilRetirement)}
          </FlagBadge>
        )}
        {lr.isVip && <FlagBadge>VIP</FlagBadge>}
        {(lr.communicationPaused || lr.communicationResumeDate) && (
          <FlagBadge icon={Pause}>
            {lr.communicationResumeDate
              ? `Paused until ${formatDate(lr.communicationResumeDate)}`
              : 'Paused'}
          </FlagBadge>
        )}
        {lr.attention.map((flag) => (
          <ToneBadge
            key={flag}
            tone={findEnumValue(enums, 'attentionFlag', flag)?.tone ?? 'caution'}
          >
            {enumLabel(enums, 'attentionFlag', flag)}
          </ToneBadge>
        ))}
      </div>
      {lr.serviceRequest && (
        <button
          type="button"
          onClick={() => lr.serviceRequest && drawer.open('sr', lr.serviceRequest.id)}
          className="inline-flex items-center gap-1.5 justify-self-start rounded-sm text-sm text-accent-text hover:underline"
        >
          <LinkIcon size={14} aria-hidden /> Replacement <IdInk value={lr.serviceRequest.number} />
        </button>
      )}
    </>
  )
}

function CoreFacts({ lr }: { lr: LeaseReturnDetail }) {
  return (
    <KeyValues>
      <KeyValue label="Model category">{lr.modelCategory}</KeyValue>
      <KeyValue label="Cost center">{lr.costCenter}</KeyValue>
      <KeyValue label="Checked in">{formatFullDateTime(lr.checkedInAt)}</KeyValue>
      <KeyValue label="Last mail">{formatDate(lr.communicationDate)}</KeyValue>
      <KeyValue label="Escalation email">{lr.escalationEmail}</KeyValue>
      <KeyValue label="Imported">{formatFullDateTime(lr.importedAt)}</KeyValue>
    </KeyValues>
  )
}

export function LeaseDrawer({ id }: { id: number }) {
  const me = useMe()
  const permissions = usePermissions()
  const { tab } = useDrawerSearch()
  const drawer = useDrawerNavigation()
  const siblings = useSiblings('lr')
  const query = useQuery(detailQueries.leaseReturn(id))
  const lr = query.data

  useEffect(() => {
    if (lr) {
      pushRecent(me?.id, {
        kind: 'lease_return',
        id: lr.id,
        title: lr.assetTag,
        subtitle: lr.contact?.displayName,
        href: `/lease-returns?lr=${lr.id}`,
      })
    }
  }, [lr, me?.id])

  const index = siblings.indexOf(id)
  const nav: DrawerNav | undefined =
    index >= 0
      ? {
          position: index + 1,
          total: siblings.length,
          onPrev: index > 0 ? () => drawer.move('lr', siblings[index - 1] ?? id) : undefined,
          onNext:
            index < siblings.length - 1
              ? () => drawer.move('lr', siblings[index + 1] ?? id)
              : undefined,
        }
      : undefined

  if (!lr) {
    return (
      <DrawerFrame label="Lease return" onClose={drawer.close} nav={nav}>
        {query.isError ? (
          <DrawerError error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <DrawerLoading />
        )}
      </DrawerFrame>
    )
  }

  const tabs: DrawerTab[] = LEASE_DRAWER_TABS.filter(
    (descriptor) =>
      hasPermission(permissions, descriptor.permission) && (descriptor.isVisible?.(lr) ?? true),
  ).map((descriptor) => ({
    id: descriptor.id,
    label: descriptor.label,
    count: descriptor.count?.(lr),
    content: <descriptor.component entity={lr} />,
  }))
  if (tabs.length === 0)
    tabs.push({ id: 'overview', label: 'Overview', content: <CoreFacts lr={lr} /> })

  return (
    <DrawerFrame
      label={`Lease return ${lr.assetTag}`}
      onClose={drawer.close}
      nav={nav}
      head={
        <>
          <LeaseHead lr={lr} />
          <WorkflowActionBar resource="leaseReturn" entity={lr} label={lr.assetTag} />
        </>
      }
    >
      <DrawerTabs tabs={tabs} value={tab} onValueChange={drawer.setTab} />
    </DrawerFrame>
  )
}
