import { OctagonX, Undo2, Volume2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { ScanResult } from '@/lib/api/types'
import { useEnums } from '@/lib/enums'
import { formatNumber, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CUE_DESCRIPTIONS } from './sound'
import { cueFor, VERDICT_STYLES, verdictIcon, verdictTitle } from './verdict'

/**
 * ScanVerdictBanner (DESIGN.md §10): 52 px tone tile + icon · title 32/650 in tone-fg · sequence
 * + time · scanned value · details (location comparison) · consequence sentence · sound cue in
 * words · Undo ⌘Z. Flashes once per new scan (320 ms). Visual only: screen readers hear the
 * station's `ScanAnnouncer`, which says it once and short.
 */
export function VerdictBanner({
  result,
  sequence,
  at,
  details,
  onUndo,
  undoPending,
  compact,
  dockUndo,
}: {
  result: ScanResult
  sequence: number
  at: Date
  /** Entity summary / location comparison chips. */
  details?: ReactNode
  onUndo?: () => void
  undoPending?: boolean
  compact?: boolean
  /** A phone dock carries Undo: the banner's own Undo hides below 768 px. */
  dockUndo?: boolean
}) {
  const enums = useEnums()
  const style = VERDICT_STYLES[result.verdict]
  const title = verdictTitle(enums, result)
  return (
    <div
      key={sequence}
      data-testid="verdict-banner"
      className={cn(
        `hg-tone-${style.tone} flex animate-verdict gap-4 rounded-md border border-[color-mix(in_srgb,var(--t)_35%,transparent)] bg-(--t-wash)`,
        compact ? 'p-3' : 'p-4 max-md:gap-3 max-md:p-3',
      )}
    >
      <span
        className={cn(
          'grid shrink-0 place-items-center rounded-sm bg-(--t) text-fg-on-accent',
          compact ? 'size-10' : 'size-[52px] max-md:size-10',
        )}
      >
        <Icon
          icon={verdictIcon(result.verdict, result.code)}
          size={compact ? 24 : 32}
          className={cn('text-[var(--hg-fg-inverse)]', !compact && 'max-md:size-6')}
        />
      </span>
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p
            className={cn(
              'min-w-0 font-[650] text-(--t-fg)',
              compact ? 'text-xl' : 'text-3xl max-md:text-xl',
            )}
          >
            {title}
          </p>
          <span className="font-mono text-xs text-fg-3">
            #{formatNumber(sequence)} · {formatTime(at)}:{String(at.getSeconds()).padStart(2, '0')}
          </span>
          {onUndo && (
            <Button
              variant="secondary"
              size="sm"
              icon={Undo2}
              shortcut="mod+z"
              loading={undoPending}
              onClick={onUndo}
              className={cn('ml-auto', dockUndo && 'max-md:hidden')}
            >
              Undo
            </Button>
          )}
        </div>
        <p className="font-mono text-lg font-semibold tracking-[0.04em] break-all max-md:text-md">
          {result.scannedValue}
        </p>
        {details}
        <p className="text-sm text-fg-2">{result.message}</p>
        <p className="flex items-center gap-1.5 text-xs text-fg-3 max-md:hidden">
          <Icon icon={Volume2} size={12} />
          Cue: {CUE_DESCRIPTIONS[cueFor(result.verdict, result.code)]}
        </p>
      </div>
    </div>
  )
}

/**
 * A scan that could not be checked (HTTP error, offline): critical, like a verdict, and visual
 * only — the station's `ScanAnnouncer` speaks it.
 */
export function ScanFailedBanner({
  sequence,
  value,
  error,
}: {
  sequence: number
  value: string
  error: string | undefined
}) {
  return (
    <div
      key={sequence}
      className="hg-tone-critical flex animate-verdict items-start gap-2.5 rounded-md border border-[color-mix(in_srgb,var(--t)_35%,transparent)] bg-(--t-wash) px-3 py-2.5"
    >
      <Icon icon={OctagonX} className="mt-0.5 text-(--t)" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-(--t-fg)">Scan #{formatNumber(sequence)} not checked</p>
        <p className="mt-0.5 text-xs text-fg-2">
          {error ?? 'The scan could not be sent.'}{' '}
          <span className="font-mono break-all">{value}</span>
        </p>
      </div>
    </div>
  )
}
