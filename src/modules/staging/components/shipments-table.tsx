import { Check, Download, ExternalLink, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { IdInk } from '@/components/domain/status'
import { IconButton } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { downloadGet } from '@/lib/api/downloads'
import type { Shipment } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { formatDateTime } from '@/lib/format'

function Links({
  urls,
  icon,
  label,
}: {
  urls: string[]
  icon: typeof ExternalLink
  label: string
}) {
  if (urls.length === 0) return <span className="text-fg-disabled">—</span>
  return (
    <span className="flex flex-wrap gap-x-2">
      {urls.map((url, index) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline decoration-line-strong"
          aria-label={`${label} ${index + 1}`}
        >
          <Icon icon={icon} size={12} />
          {index + 1}
        </a>
      ))}
    </span>
  )
}

/** Shipments with tracking/return links and label download (parcel shipping, SR drawer). */
export function ShipmentsTable({
  shipments,
  onOpen,
  empty,
  showSr = true,
}: {
  shipments: readonly Shipment[]
  onOpen?: (srId: number) => void
  empty: ReactNode
  showSr?: boolean
}) {
  const canLabel = useCan('fulfilment.ship')
  if (shipments.length === 0) return <>{empty}</>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Shipments">
        <thead className="text-left text-xs text-fg-3">
          <tr>
            <th className="px-3 py-1.5 font-medium">Created</th>
            {showSr && <th className="py-1.5 font-medium">SR number</th>}
            <th className="py-1.5 font-medium">Shipment</th>
            <th className="py-1.5 text-right font-medium">Parcels</th>
            <th className="px-3 py-1.5 font-medium">Tracking</th>
            <th className="py-1.5 font-medium">Return</th>
            <th className="py-1.5 font-medium">Confirmation</th>
            <th className="px-3 py-1.5 text-right font-medium">Label</th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((shipment) => (
            <tr key={shipment.id} className="border-t border-line-subtle">
              <td className="px-3 py-1.5 whitespace-nowrap text-fg-2">
                {formatDateTime(shipment.createdAt)}
              </td>
              {showSr && (
                <td className="py-1.5">
                  {onOpen ? (
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => onOpen(shipment.serviceRequest.id)}
                    >
                      <IdInk value={shipment.serviceRequest.number} />
                    </button>
                  ) : (
                    <IdInk value={shipment.serviceRequest.number} />
                  )}
                </td>
              )}
              <td className="hg-mono py-1.5 text-xs">{shipment.carrierShipmentId}</td>
              <td className="py-1.5 text-right">{shipment.parcelCount}</td>
              <td className="px-3 py-1.5">
                <Links urls={shipment.trackingUrls} icon={ExternalLink} label="Tracking parcel" />
              </td>
              <td className="py-1.5">
                <Links urls={shipment.returnTrackingUrls} icon={RotateCcw} label="Return parcel" />
              </td>
              <td className="py-1.5">
                {shipment.confirmationMailSent ? (
                  <span className="inline-flex items-center gap-1 text-fg-2">
                    <Icon icon={Check} size={14} className="text-tone-done" /> Sent
                  </span>
                ) : (
                  <span className="text-fg-3">Not sent</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-right">
                {canLabel && (
                  <IconButton
                    icon={Download}
                    size="sm"
                    label={`Download label ${shipment.carrierShipmentId}`}
                    onClick={() => void downloadGet(`/shipments/${shipment.id}/label`)}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
