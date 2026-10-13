import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ChevronLeft, ChevronRight, History } from 'lucide-react'
import { useState } from 'react'
import { useDrawerNavigation } from '@/components/drawer/drawer-state'
import { IdInk, StatusBadge } from '@/components/domain/status'
import { IconButton } from '@/components/ui/button'
import { EmptyState, SkeletonRows } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import type { AssetDetail, AssetMovement, Tone } from '@/lib/api/types'
import { useEnums } from '@/lib/enums'
import { formatFullDateTime, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { stockQueries } from '../api'

const PER_PAGE = 25

function where(location: AssetMovement['toLocation'] | null, place: string | null) {
  if (!location) return '∅'
  return place ? `${location.name} · ${place}` : location.name
}

/** Asset drawer › Movements: the append-only ledger (newest first), 25 per page. */
export function AssetMovements({ asset }: { asset: AssetDetail }) {
  const enums = useEnums()
  const drawer = useDrawerNavigation()
  const [page, setPage] = useState(1)
  const query = useQuery(stockQueries.movements(asset.id, page, PER_PAGE))
  const data = query.data
  const trigger = (value: string) => enums.trigger.find((t) => t.value === value)?.label ?? value
  const tone = (status: string): Tone =>
    enums.assetStatus.find((s) => s.value === status)?.tone ?? 'intake'
  if (!data)
    return query.isError ? (
      <EmptyState icon={History} title="The ledger could not be loaded." />
    ) : (
      <SkeletonRows rows={6} />
    )
  if (data.data.length === 0) return <EmptyState icon={History} title="No movements recorded." />
  return (
    <div className={cn('grid gap-3', query.isPlaceholderData && 'opacity-60')}>
      <ol className="grid">
        {data.data.map((m, index) => (
          <li key={m.id} className="relative grid grid-cols-[16px_minmax(0,1fr)] gap-x-3 pb-4">
            <span
              className={`hg-tone-${tone(m.toStatus)} mt-1 size-3 rounded-full border-2 border-(--t) bg-surface`}
              aria-hidden
            />
            {index < data.data.length - 1 && (
              <span className="absolute top-5 bottom-0 left-[5px] w-0.5 bg-line" aria-hidden />
            )}
            <div className="grid min-w-0 gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <b className="font-medium">{m.actionLabel}</b>
                <StatusBadge entity="assetStatus" state={m.toStatus} size="sm" />
                <span className="ml-auto text-xs text-fg-3">
                  {formatFullDateTime(m.occurredAt)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-fg-2">
                <span>{where(m.fromLocation, m.fromInstallationPlace)}</span>
                <Icon icon={ArrowRight} size={12} className="text-fg-3" />
                <span>{where(m.toLocation, m.toInstallationPlace)}</span>
              </div>
              <div className="flex flex-wrap gap-x-3 text-xs text-fg-3">
                <span>{m.actor ? m.actor.displayName : trigger(m.trigger)}</span>
                {m.serviceRequest && (
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => m.serviceRequest && drawer.open('sr', m.serviceRequest.id)}
                  >
                    <IdInk value={m.serviceRequest.number} />
                  </button>
                )}
                {m.sourceRef && <span className="hg-mono">{m.sourceRef}</span>}
              </div>
              {m.reason && <p className="text-sm">“{m.reason}”</p>}
            </div>
          </li>
        ))}
      </ol>
      {data.meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-fg-3">
          {formatNumber(data.meta.total)} movements · page {page} of {data.meta.totalPages}
          <IconButton
            size="sm"
            icon={ChevronLeft}
            label="Newer"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          />
          <IconButton
            size="sm"
            icon={ChevronRight}
            label="Older"
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          />
        </div>
      )}
    </div>
  )
}
