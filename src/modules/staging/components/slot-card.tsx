import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Crosshair, PackageCheck, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { IdInk } from '@/components/domain/status'
import { Button } from '@/components/ui/button'
import { Skeleton, ToneBadge } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import type { ServiceRequestItem } from '@/lib/api/types'
import { enumLabel, useEnums } from '@/lib/enums'
import { cn } from '@/lib/utils'
import { stagingQueries } from '@/modules/staging/api'

/**
 * One new slot of the personalization work panel (SCREENS.md §5.2 "Items to deliver"): ordered
 * type, article, the FIFO-suggested device with its installation place in large type, candidate
 * count, the assigned device (+ Unassign) and "Other candidates" (FIFO rank).
 */
export function SlotCard({
  srId,
  item,
  focused,
  canEdit,
  onFocus,
  onUnassign,
  unassigning,
}: {
  srId: number
  item: ServiceRequestItem
  focused: boolean
  canEdit: boolean
  onFocus: () => void
  onUnassign: () => void
  unassigning?: boolean
}) {
  const enums = useEnums()
  const [open, setOpen] = useState(false)
  const candidates = useQuery(stagingQueries.candidates(srId, item.slot))
  const rows = candidates.data?.data ?? []
  const suggested = rows[0]
  const hub = candidates.data?.site.name.replace(/ Hub$/, '') ?? 'hub'
  const count = rows.length >= 50 ? '50+' : String(rows.length)
  const assigned = item.asset

  return (
    <section
      aria-label={enumLabel(enums, 'itemSlot', item.slot)}
      aria-current={focused ? 'true' : undefined}
      className={cn(
        'grid gap-3 rounded-sm border bg-surface p-3',
        focused && canEdit
          ? 'border-accent-line shadow-[0_0_0_1px_var(--hg-accent)]'
          : 'border-line',
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-fg-2">
          {enumLabel(enums, 'itemSlot', item.slot)}
        </span>
        {canEdit && !focused && (
          <Button size="sm" variant="ghost" icon={Crosshair} onClick={onFocus}>
            Scan into this slot
          </Button>
        )}
        {focused && canEdit && (
          <ToneBadge tone="booked" icon={Crosshair}>
            Scans go here
          </ToneBadge>
        )}
        {assigned && (
          <ToneBadge tone="done" icon={PackageCheck}>
            Assigned
          </ToneBadge>
        )}
      </header>
      <div className="grid gap-0.5">
        <p className="font-medium">{item.requestedType ?? 'No device type'}</p>
        <p className="text-xs text-fg-3">
          {item.article
            ? `${item.article.name} · ${item.article.number}`
            : 'Not in the article catalogue — assignment is not possible.'}
        </p>
      </div>

      {assigned ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xs bg-sunken px-3 py-2">
          <div className="grid gap-0.5">
            <span className="text-xs text-fg-3">Assigned device</span>
            <span className="flex items-center gap-2">
              <IdInk value={assigned.assetTag ?? assigned.serialNumber} />
              <span className="hg-mono text-xs text-fg-3">{assigned.serialNumber}</span>
            </span>
          </div>
          {assigned.installationPlace && (
            <div className="grid gap-0.5">
              <span className="text-xs text-fg-3">Place</span>
              <span className="hg-mono font-semibold">{assigned.installationPlace}</span>
            </div>
          )}
          {canEdit && (
            <Button
              size="sm"
              variant="ghost"
              icon={Undo2}
              className="ml-auto"
              loading={unassigning}
              onClick={onUnassign}
            >
              Unassign
            </Button>
          )}
        </div>
      ) : candidates.isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : suggested ? (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2" data-testid="suggested-asset">
          <div className="grid">
            <span className="text-xs text-fg-3">Pull from place</span>
            <span className="hg-mono text-[28px] leading-8 font-semibold text-accent-text">
              {suggested.asset.installationPlace}
            </span>
          </div>
          <div className="grid gap-0.5 text-sm">
            <span className="flex items-center gap-2">
              <IdInk value={suggested.asset.assetTag ?? suggested.asset.serialNumber} />
              <span className="hg-mono text-xs text-fg-3">{suggested.asset.serialNumber}</span>
            </span>
            <span className="text-xs text-fg-3">
              {suggested.ageDays !== null ? `${suggested.ageDays} days in stock · ` : ''}
              {count} in {hub} staging
            </span>
          </div>
        </div>
      ) : (
        <ToneBadge tone="critical">No stock in {hub} staging</ToneBadge>
      )}

      {rows.length > 1 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs text-fg-2 hover:text-fg"
          >
            <Icon icon={open ? ChevronDown : ChevronRight} size={12} />
            Other candidates ({rows.length - 1})
          </button>
          {open && (
            <table className="mt-2 w-full text-xs">
              <thead className="text-left text-fg-3">
                <tr>
                  <th className="py-1 font-medium">#</th>
                  <th className="py-1 font-medium">Place</th>
                  <th className="py-1 font-medium">Asset tag</th>
                  <th className="py-1 font-medium">Serial</th>
                  <th className="py-1 text-right font-medium">Age</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(1, 12).map((row) => (
                  <tr key={row.asset.id} className="border-t border-line-subtle">
                    <td className="py-1 text-fg-3">{row.fifoRank}</td>
                    <td className="hg-mono py-1">{row.asset.installationPlace}</td>
                    <td className="py-1">
                      <IdInk value={row.asset.assetTag} />
                    </td>
                    <td className="hg-mono py-1 text-fg-2">{row.asset.serialNumber}</td>
                    <td className="py-1 text-right text-fg-2">
                      {row.ageDays !== null ? `${row.ageDays} d` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  )
}
