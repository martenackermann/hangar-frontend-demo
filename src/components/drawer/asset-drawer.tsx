import { useQuery } from '@tanstack/react-query'
import { MapPin } from 'lucide-react'
import { useEffect } from 'react'
import { pushRecent } from '@/components/app/command-palette-store'
import { CopyableId, IdInk, StatusBadge } from '@/components/domain/status'
import { FlagBadge } from '@/components/ui/feedback'
import { KeyValue, KeyValues } from '@/components/ui/page'
import { detailQueries } from '@/lib/api/details'
import type { AssetDetail } from '@/lib/api/types'
import { hasPermission } from '@/lib/auth/permissions'
import { useMe, usePermissions } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatFullDateTime } from '@/lib/format'
import { ASSET_DRAWER_TABS } from '@/lib/registry'
import { DrawerFrame, DrawerTabs, type DrawerNav, type DrawerTab } from './drawer-frame'
import { DrawerError, DrawerLoading } from './drawer-states'
import { useDrawerNavigation, useDrawerSearch, useSiblings } from './drawer-state'
import { WorkflowActionBar } from './workflow-actions'

/** "Available · B4-12" (DESIGN.md §3.3). */
export function assetStatusLabel(
  asset: Pick<AssetDetail, 'status' | 'installationPlace'>,
  label: string,
): string {
  return asset.status === 'available' && asset.installationPlace
    ? `${label} · ${asset.installationPlace}`
    : label
}

function AssetHead({ asset }: { asset: AssetDetail }) {
  const enums = useEnums()
  const drawer = useDrawerNavigation()
  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className="text-[21px] leading-7 font-semibold">
          <CopyableId value={asset.serialNumber} />
        </span>
        {asset.assetTag && <IdInk value={asset.assetTag} className="ml-auto text-xs text-fg-2" />}
      </div>
      <div className="flex flex-wrap items-baseline gap-2">
        <b className="text-lg font-semibold">
          {asset.article?.name ?? asset.model ?? 'Unknown model'}
        </b>
        {asset.article && <span className="text-fg-3">{asset.article.internalDescription}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge
          entity="assetStatus"
          state={asset.status}
          variant="wash"
          since={asset.statusChangedAt}
          label={assetStatusLabel(asset, enumLabel(enums, 'assetStatus', asset.status))}
        />
        <FlagBadge icon={MapPin}>{asset.location.name}</FlagBadge>
      </div>
      {asset.serviceRequest && (
        <button
          type="button"
          onClick={() => asset.serviceRequest && drawer.open('sr', asset.serviceRequest.id)}
          className="justify-self-start text-sm text-accent-text hover:underline"
        >
          Service request <IdInk value={asset.serviceRequest.number} />
        </button>
      )}
    </>
  )
}

function CoreFacts({ asset }: { asset: AssetDetail }) {
  return (
    <KeyValues>
      <KeyValue label="Article number">{asset.article?.number}</KeyValue>
      <KeyValue label="Installation place">{asset.installationPlace}</KeyValue>
      <KeyValue label="Assigned user">{asset.assignedContact?.displayName}</KeyValue>
      <KeyValue label="Checked in">{formatFullDateTime(asset.checkedInAt)}</KeyValue>
      <KeyValue label="Order number">{asset.orderNumber}</KeyValue>
      <KeyValue label="MAC address">{asset.macAddress}</KeyValue>
      <KeyValue label="CI name">{asset.ciName}</KeyValue>
      <KeyValue label="External asset id">{asset.externalAssetId}</KeyValue>
    </KeyValues>
  )
}

export function AssetDrawer({ id }: { id: number }) {
  const me = useMe()
  const permissions = usePermissions()
  const { tab } = useDrawerSearch()
  const drawer = useDrawerNavigation()
  const siblings = useSiblings('asset')
  const query = useQuery(detailQueries.asset(id))
  const asset = query.data

  useEffect(() => {
    if (asset) {
      pushRecent(me?.id, {
        kind: 'asset',
        id: asset.id,
        title: asset.assetTag ?? asset.serialNumber,
        subtitle: asset.article?.name ?? asset.model ?? undefined,
        href: `/stock/assets?asset=${asset.id}`,
      })
    }
  }, [asset, me?.id])

  const index = siblings.indexOf(id)
  const nav: DrawerNav | undefined =
    index >= 0
      ? {
          position: index + 1,
          total: siblings.length,
          onPrev: index > 0 ? () => drawer.move('asset', siblings[index - 1] ?? id) : undefined,
          onNext:
            index < siblings.length - 1
              ? () => drawer.move('asset', siblings[index + 1] ?? id)
              : undefined,
        }
      : undefined

  if (!asset) {
    return (
      <DrawerFrame label="Asset" onClose={drawer.close} nav={nav}>
        {query.isError ? (
          <DrawerError error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <DrawerLoading />
        )}
      </DrawerFrame>
    )
  }

  const tabs: DrawerTab[] = ASSET_DRAWER_TABS.filter(
    (descriptor) =>
      hasPermission(permissions, descriptor.permission) && (descriptor.isVisible?.(asset) ?? true),
  ).map((descriptor) => ({
    id: descriptor.id,
    label: descriptor.label,
    count: descriptor.count?.(asset),
    content: <descriptor.component entity={asset} />,
  }))
  if (tabs.length === 0)
    tabs.push({ id: 'overview', label: 'Overview', content: <CoreFacts asset={asset} /> })

  return (
    <DrawerFrame
      label={`Asset ${asset.serialNumber}`}
      onClose={drawer.close}
      nav={nav}
      head={
        <>
          <AssetHead asset={asset} />
          <WorkflowActionBar
            resource="asset"
            entity={asset}
            label={asset.assetTag ?? asset.serialNumber}
          />
        </>
      }
    >
      <DrawerTabs tabs={tabs} value={tab} onValueChange={drawer.setTab} />
    </DrawerFrame>
  )
}
