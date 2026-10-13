import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { IdInk } from '@/components/domain/status'
import { Timeline, type TimelineEvent } from '@/components/domain/timeline'
import { SkeletonRows } from '@/components/ui/feedback'
import type { EnumsResponse, HistoryEntry, Trigger } from '@/lib/api/types'
import { enumLabel, findEnumValue, useEnums } from '@/lib/enums'
import { cn } from '@/lib/utils'
import { historyQuery } from '../api'

type Kind = HistoryEntry['kind']
const KIND_LABELS: Record<Kind, string> = {
  transition: 'Status',
  mail: 'Mails',
  asset_movement: 'Devices',
  comment: 'Comments',
}
const SOURCES: Record<Trigger, string> = {
  user: 'User',
  job: 'Daily dispatch',
  import: 'ITSM import',
  sync: 'Booking sync',
  system: 'System',
}

function statusLabel(
  enums: EnumsResponse,
  entity: 'serviceRequestStatus' | 'leaseReturnStatus',
  value: string | null,
) {
  return value ? enumLabel(enums, entity, value) : 'new'
}

function toEvent(
  entry: HistoryEntry,
  enums: EnumsResponse,
  entity: 'serviceRequestStatus' | 'leaseReturnStatus',
): TimelineEvent {
  const actor = entry.actor?.displayName ?? SOURCES[entry.trigger]
  switch (entry.kind) {
    case 'transition': {
      const changed = entry.fromStatus !== entry.toStatus
      return {
        id: entry.id,
        occurredAt: entry.occurredAt,
        actor,
        tone: findEnumValue(enums, entity, entry.toStatus)?.tone ?? 'intake',
        title: changed ? (
          <>
            {entry.actionLabel}{' '}
            <span className="font-normal text-fg-3">
              · {statusLabel(enums, entity, entry.fromStatus)} →{' '}
              {statusLabel(enums, entity, entry.toStatus)}
            </span>
          </>
        ) : (
          entry.actionLabel
        ),
        body: entry.comment ?? undefined,
        groupKey: entry.trigger === 'user' ? undefined : `${entry.action}`,
      }
    }
    case 'mail':
      return {
        id: entry.id,
        occurredAt: entry.occurredAt,
        actor,
        tone: entry.status === 'failed' ? 'critical' : 'outreach',
        title: <>Mail · {entry.subject ?? entry.templateId}</>,
        body: (
          <span className="text-xs">
            to {entry.to.join(', ')}
            {entry.status !== 'sent' && ` · ${enumLabel(enums, 'mailStatus', entry.status)}`}
          </span>
        ),
      }
    case 'asset_movement':
      return {
        id: entry.id,
        occurredAt: entry.occurredAt,
        actor,
        tone: findEnumValue(enums, 'assetStatus', entry.toStatus)?.tone ?? 'intake',
        title: (
          <>
            <IdInk value={entry.asset.assetTag ?? entry.asset.serialNumber} whole />{' '}
            {enumLabel(enums, 'assetAction', entry.action)}
          </>
        ),
        body: (
          <span className="text-xs">
            {entry.fromLocation ? `${entry.fromLocation.name} → ` : ''}
            {entry.toLocation.name}
            {entry.reason ? ` · ${entry.reason}` : ''}
          </span>
        ),
      }
    case 'comment':
      return {
        id: entry.id,
        occurredAt: entry.occurredAt,
        actor,
        tone: 'intake',
        title: 'Comment',
        body: entry.body,
      }
  }
}

/** Unified timeline with filter chips by kind (SCREENS.md §1.5 History tab). */
export function HistoryTimeline({ kind, id }: { kind: 'sr' | 'lr'; id: number }) {
  const enums = useEnums()
  const entity = kind === 'sr' ? 'serviceRequestStatus' : 'leaseReturnStatus'
  const { data, isError } = useQuery(historyQuery(kind, id))
  const [kinds, setKinds] = useState<Kind[]>([])
  if (isError) return <p className="text-sm text-fg-3">The history could not be loaded.</p>
  if (!data) return <SkeletonRows rows={6} />
  const present = [...new Set(data.data.map((e) => e.kind))]
  const shown = data.data.filter((e) => kinds.length === 0 || kinds.includes(e.kind))
  return (
    <div className="grid gap-3">
      {present.length > 1 && (
        <div className="flex flex-wrap gap-1" aria-label="Filter history">
          {present.map((kind) => {
            const active = kinds.includes(kind)
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setKinds((prev) => (active ? prev.filter((k) => k !== kind) : [...prev, kind]))
                }
                className={cn(
                  'inline-flex h-6 items-center gap-1 rounded-xs px-2 text-xs text-fg-2 shadow-[inset_0_0_0_1px_var(--hg-line)] hover:text-fg',
                  active && 'bg-accent-wash text-fg shadow-[inset_0_0_0_1px_var(--hg-accent-line)]',
                )}
              >
                {KIND_LABELS[kind]}
                <span className="font-mono text-fg-3">
                  {data.data.filter((e) => e.kind === kind).length}
                </span>
              </button>
            )
          })}
        </div>
      )}
      <Timeline events={shown.map((entry) => toEvent(entry, enums, entity))} />
    </div>
  )
}
