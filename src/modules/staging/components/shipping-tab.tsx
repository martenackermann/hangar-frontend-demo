import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, PackageCheck, Truck } from 'lucide-react'
import { IdInk } from '@/components/domain/status'
import { SkeletonRows } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { SectionHeading } from '@/components/ui/page'
import type { ServiceRequestDetail } from '@/lib/api/types'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatDateTime } from '@/lib/format'
import { stagingQueries } from '@/modules/staging/api'
import { ShipmentsTable } from '@/modules/staging/components/shipments-table'

/** SR drawer tab "Shipping" (SCREENS.md §1.5, order 7): shipments, tracking, labels, packing. */
export function ShippingTab({ entity: sr }: { entity: ServiceRequestDetail }) {
  const enums = useEnums()
  const shipments = useQuery(stagingQueries.srShipments(sr.id))
  const devices = sr.items.filter((item) => item.direction === 'deliver')
  return (
    <div className="grid gap-1">
      <SectionHeading>Shipments</SectionHeading>
      {shipments.isPending ? (
        <SkeletonRows rows={2} />
      ) : (
        <ShipmentsTable
          shipments={shipments.data?.data ?? []}
          showSr={false}
          empty={<p className="text-sm text-fg-3">No shipment created yet.</p>}
        />
      )}

      <SectionHeading>Packing</SectionHeading>
      <ul className="grid gap-1.5 text-sm" aria-label="Packed devices">
        {devices.map((item) => (
          <li key={item.slot} className="flex items-center gap-2">
            <Icon
              icon={item.packedAt ? PackageCheck : Truck}
              size={14}
              className={item.packedAt ? 'text-tone-done' : 'text-fg-3'}
            />
            <IdInk value={item.asset?.assetTag ?? item.asset?.serialNumber} />
            <span className="truncate text-fg-2">
              {item.asset?.article?.name ?? item.requestedType}
            </span>
            <span className="ml-auto text-xs text-fg-3">
              {item.packedAt
                ? `Packed ${formatDateTime(item.packedAt)}${item.packedBy ? ` · ${item.packedBy.displayName}` : ''}`
                : enumLabel(enums, 'itemSlot', item.slot)}
            </span>
          </li>
        ))}
      </ul>

      {sr.status === 'ready_for_picking' && sr.supplyingSite && (
        <p className="mt-3 text-sm">
          <Link
            to="/warehouse/parcel-shipping"
            search={{ siteId: sr.supplyingSite.id, selected: sr.id }}
            className="inline-flex items-center gap-1 text-accent-text hover:underline"
          >
            Open in Parcel shipping <Icon icon={ArrowUpRight} size={14} />
          </Link>
        </p>
      )}
    </div>
  )
}
