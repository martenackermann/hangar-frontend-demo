import { useVirtualizer } from '@tanstack/react-virtual'
import { LoaderCircle, Undo2 } from 'lucide-react'
import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Tooltip } from '@/components/ui/tooltip'
import type { ScanResult } from '@/lib/api/types'
import { useEnums } from '@/lib/enums'
import { formatNumber, formatTime } from '@/lib/format'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { VERDICT_STYLES, verdictIcon, verdictTitle } from './verdict'

export interface ScanEntry<T = unknown> {
  id: string
  sequence: number
  at: Date
  value: string
  state: 'pending' | 'done' | 'failed'
  result?: ScanResult<T>
  /** Failure text (HTTP error, offline). */
  error?: string
  undone?: boolean
}

/** Pointer clicks on list controls keep the focus where it is (the locked scan field). */
const keepFocus = (event: MouseEvent) => event.preventDefault()

const GRID =
  'grid-cols-[56px_72px_minmax(120px,1fr)_minmax(140px,1.2fr)_minmax(0,2fr)_72px] max-md:grid-cols-[48px_minmax(0,1fr)_minmax(0,1fr)_40px] max-md:pointer-coarse:grid-cols-[40px_minmax(0,1fr)_minmax(0,1fr)_44px]'

/**
 * ScanList (DESIGN.md §10): newest first, virtualized; # · time · value · verdict (+ message) ·
 * entity summary · undo. The last scan is highlighted and carries the labelled "Undo"; older rows
 * have an icon-only undo that asks first. Filter All / Flagged (count). Screen readers get a
 * named table with column headers and "Undone" in words.
 */
export function ScanList<T>({
  entries,
  describe,
  onUndo,
  title = 'Scans this session',
  empty = 'Scan the first item to start.',
}: {
  entries: readonly ScanEntry<T>[]
  describe?: (result: ScanResult<T>) => ReactNode
  onUndo?: (entry: ScanEntry<T>) => void | Promise<void>
  title?: string
  empty?: ReactNode
}) {
  const enums = useEnums()
  const coarse = useMediaQuery('(pointer: coarse)')
  const rowHeight = coarse ? 44 : 32
  const [filter, setFilter] = useState<'all' | 'flagged'>('all')
  const [confirming, setConfirming] = useState<ScanEntry<T> | null>(null)
  const [undoing, setUndoing] = useState(false)
  const flaggedCount = entries.filter(
    (e) => e.state === 'failed' || (e.result && e.result.verdict !== 'ok'),
  ).length
  const rows = useMemo(
    () =>
      filter === 'all'
        ? entries
        : entries.filter((e) => e.state === 'failed' || (e.result && e.result.verdict !== 'ok')),
    [entries, filter],
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  // TanStack Virtual returns fresh functions each render, so React Compiler skips this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
    getItemKey: (index) => rows[index]?.id ?? index,
  })
  const latestId = entries[0]?.id

  const confirmUndo = async () => {
    if (!confirming || !onUndo) return
    setUndoing(true)
    try {
      await onUndo(confirming)
    } finally {
      setUndoing(false)
      setConfirming(null)
    }
  }

  return (
    <section className="flex min-h-0 flex-col" aria-label={title}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 max-md:px-3">
        <h2 className="text-sm font-semibold">
          {title}{' '}
          <span className="ml-1 font-mono text-xs text-fg-3">{formatNumber(entries.length)}</span>
        </h2>
        <div role="presentation" onMouseDown={keepFocus}>
          <SegmentedControl
            label="Filter scans"
            value={filter}
            onValueChange={setFilter}
            className="pointer-coarse:h-11"
            options={[
              { value: 'all', label: 'All' },
              { value: 'flagged', label: `Flagged ${flaggedCount}` },
            ]}
          />
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-fg-3">{empty}</p>
      ) : (
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-auto"
          role="table"
          aria-label={title}
          aria-rowcount={rows.length + 1}
        >
          <div role="rowgroup" className="sr-only">
            <div role="row" aria-rowindex={1}>
              <span role="columnheader">#</span>
              <span role="columnheader" className="max-md:hidden">
                Time
              </span>
              <span role="columnheader">Scanned</span>
              <span role="columnheader">Verdict</span>
              <span role="columnheader" className="max-md:hidden">
                Details
              </span>
              <span role="columnheader">Undo</span>
            </div>
          </div>
          <div role="rowgroup" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const entry = rows[item.index]
              if (!entry) return null
              const result = entry.result
              const style = result ? VERDICT_STYLES[result.verdict] : null
              const latest = entry.id === latestId
              const canUndo = Boolean(onUndo && result?.undo && result.applied && !entry.undone)
              const label = result ? verdictTitle(enums, result) : null
              return (
                <div
                  key={entry.id}
                  role="row"
                  aria-rowindex={item.index + 2}
                  className={cn(
                    'absolute inset-x-0 grid items-center gap-3 border-b border-line-subtle px-4 text-sm max-md:gap-2 max-md:px-3',
                    GRID,
                    latest && 'animate-row-in bg-accent-wash',
                    entry.undone && 'text-fg-3 line-through',
                  )}
                  style={{ height: rowHeight, transform: `translateY(${item.start}px)` }}
                >
                  <span role="cell" className="font-mono text-xs text-fg-3">
                    {formatNumber(entry.sequence)}
                  </span>
                  <span role="cell" className="font-mono text-xs text-fg-2 max-md:hidden">
                    {formatTime(entry.at)}:{String(entry.at.getSeconds()).padStart(2, '0')}
                  </span>
                  <span role="cell" className="truncate font-mono">
                    {entry.value}
                  </span>
                  <span role="cell" className="min-w-0">
                    {entry.state === 'pending' ? (
                      <span className="inline-flex items-center gap-1.5 text-fg-3">
                        <Icon icon={LoaderCircle} size={14} className="animate-spin" /> Checking…
                      </span>
                    ) : entry.state === 'failed' ? (
                      <span className="block truncate text-tone-critical-fg">
                        {entry.error ?? 'Failed'}
                      </span>
                    ) : result && style ? (
                      result.verdict === 'ok' ? (
                        <span className="inline-flex max-w-full items-center gap-1.5 text-fg">
                          <Icon
                            icon={verdictIcon(result.verdict, result.code)}
                            size={14}
                            className="shrink-0 text-tone-done"
                          />
                          <span className="truncate">{entry.undone ? 'Undone' : label}</span>
                        </span>
                      ) : (
                        <span
                          className={`hg-tone-${style.tone} hg-badge inline-flex h-badge max-w-full items-center gap-1 rounded-xs bg-(--t-wash) px-1.5 text-xs font-medium text-(--t-fg) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--t)_28%,transparent)]`}
                        >
                          <Icon
                            icon={verdictIcon(result.verdict, result.code)}
                            size={12}
                            className="shrink-0 text-(--t)"
                          />
                          <span className="truncate">{label}</span>
                          {entry.undone && <span className="sr-only">, undone</span>}
                        </span>
                      )
                    ) : null}
                  </span>
                  <span role="cell" className="min-w-0 truncate text-xs text-fg-2 max-md:hidden">
                    {result ? (describe?.(result) ?? result.message) : null}
                  </span>
                  <span role="cell" className="flex justify-end">
                    {canUndo &&
                      (latest ? (
                        <button
                          type="button"
                          onMouseDown={keepFocus}
                          onClick={() => void onUndo?.(entry)}
                          className="inline-flex h-6 items-center gap-1 rounded-xs px-1.5 text-xs text-fg-2 hover:bg-hover hover:text-fg pointer-coarse:h-10"
                        >
                          <Icon icon={Undo2} size={14} /> Undo
                        </button>
                      ) : (
                        <Tooltip content={`Undo scan #${entry.sequence}`}>
                          <button
                            type="button"
                            aria-label={`Undo scan #${entry.sequence}`}
                            onMouseDown={keepFocus}
                            onClick={() => setConfirming(entry)}
                            className="grid size-6 place-items-center rounded-xs text-fg-3 hover:bg-hover hover:text-fg pointer-coarse:size-10"
                          >
                            <Icon icon={Undo2} size={14} />
                          </button>
                        </Tooltip>
                      ))}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !undoing) setConfirming(null)
        }}
        title={confirming ? `Undo scan #${formatNumber(confirming.sequence)}?` : 'Undo scan?'}
        description={
          confirming
            ? `${confirming.value}${
                confirming.result ? ` · ${verdictTitle(enums, confirming.result)}` : ''
              }. The scan is reversed; scan the item again to redo it.`
            : undefined
        }
        confirmLabel="Undo scan"
        cancelLabel="Keep scan"
        pending={undoing}
        onConfirm={confirmUndo}
      />
    </section>
  )
}
