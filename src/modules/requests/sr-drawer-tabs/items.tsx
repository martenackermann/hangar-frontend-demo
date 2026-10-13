import { PackageCheck, ScanLine, UserCheck, type LucideIcon } from 'lucide-react'
import { IdInk, StatusBadge } from '@/components/domain/status'
import { Icon } from '@/components/ui/icon'
import type { ServiceRequestDetail, ServiceRequestItem } from '@/lib/api/types'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatFullDateTime } from '@/lib/format'
import type { DrawerTabDescriptor } from '@/lib/registry'

function Mark({
  icon,
  at,
  by,
  label,
}: {
  icon: LucideIcon
  at: string | null
  by: string | null | undefined
  label: string
}) {
  if (!at) return null
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-tone-done-fg"
      title={`${label} ${formatFullDateTime(at)}${by ? ` by ${by}` : ''}`}
    >
      <Icon icon={icon} size={12} /> {label}
    </span>
  )
}

function ItemRow({ item }: { item: ServiceRequestItem }) {
  const enums = useEnums()
  const asset = item.asset
  return (
    <li className="grid gap-1 px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-semibold text-fg-2">{enumLabel(enums, 'itemSlot', item.slot)}</span>
        <span className="text-xs text-fg-3">{item.direction === 'deliver' ? 'deliver' : 'collect'}</span>
        <span className="ml-auto flex items-center gap-2">
          <Mark icon={UserCheck} at={item.assignedAt} by={item.assignedBy?.displayName} label="Assigned" />
          <Mark icon={PackageCheck} at={item.packedAt} by={item.packedBy?.displayName} label="Packed" />
          <Mark icon={ScanLine} at={item.verifiedAt} by={item.verifiedBy?.displayName} label="Verified" />
        </span>
      </div>
      <div className="text-sm">
        {item.direction === 'deliver' ? (
          <>
            {item.requestedType}
            {item.article ? (
              <span className="text-fg-3"> · {item.article.name} ({item.article.number})</span>
            ) : (
              <span className="text-tone-caution-fg"> · unknown article</span>
            )}
          </>
        ) : (
          <>
            Old device {item.expectedAssetTag && <IdInk value={item.expectedAssetTag} whole />}
          </>
        )}
      </div>
      {asset ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-2">
          <span>
            <IdInk value={asset.serialNumber} whole />
            {asset.assetTag && (
              <>
                {' · '}
                <IdInk value={asset.assetTag} whole />
              </>
            )}
          </span>
          <StatusBadge entity="assetStatus" state={asset.status} size="sm" />
          <span className="text-fg-3">
            {asset.location.name}
            {asset.installationPlace ? ` · ${asset.installationPlace}` : ''}
          </span>
          {item.verifiedSerial && item.verifiedSerial !== asset.serialNumber && (
            <span className="text-tone-caution-fg">scanned {item.verifiedSerial}</span>
          )}
        </div>
      ) : (
        <div className="text-xs text-fg-3">
          {item.direction === 'deliver' ? 'No device assigned yet.' : 'Device not identified yet.'}
        </div>
      )}
    </li>
  )
}

function ItemsTab({ entity: sr }: { entity: ServiceRequestDetail }) {
  if (sr.items.length === 0) return <p className="text-sm text-fg-3">This request has no items.</p>
  return (
    <ul className="divide-y divide-line-subtle rounded-sm border border-line" aria-label="Items">
      {sr.items.map((item) => (
        <ItemRow key={item.id} item={item} />
      ))}
    </ul>
  )
}

const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'items',
  label: 'Items',
  order: 20,
  count: (sr) => sr.items.length,
  component: ItemsTab,
}
export default tab
