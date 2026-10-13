import { Undo2, Volume2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { ScanResult } from '@/lib/api/types'
import { findEnumValue, useEnums } from '@/lib/enums'
import { formatNumber, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CUE_DESCRIPTIONS } from './sound'
import { VERDICT_STYLES, verdictIcon } from './verdict'

/**
 * ScanVerdictBanner (DESIGN.md §10): 52 px tone tile + icon · title 32/650 in tone-fg · sequence
 * + time · scanned value · details (location comparison) · consequence sentence · sound cue in
 * words · Undo ⌘Z. Flashes once per new verdict (320 ms). `role="status"` + assertive.
 */
export function VerdictBanner({
  result,
  sequence,
  at,
  details,
  onUndo,
  undoPending,
  compact,
}: {
  result: ScanResult
  sequence: number
  at: Date
  /** Entity summary / location comparison chips. */
  details?: ReactNode
  onUndo?: () => void
  undoPending?: boolean
  compact?: boolean
}) {
  const enums = useEnums()
  const style = VERDICT_STYLES[result.verdict]
  const codeLabel = findEnumValue(enums, 'scanCode', result.code)?.label
  const title = codeLabel ?? style.title
  return (
    <div
      key={`${sequence}-${result.code}`}
      role="status"
      aria-live="assertive"
      aria-atomic="true"
      className={cn(
        `hg-tone-${style.tone} flex animate-verdict gap-4 rounded-md border border-[color-mix(in_srgb,var(--t)_35%,transparent)] bg-(--t-wash)`,
        compact ? 'p-3' : 'p-4 max-md:p-3',
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
          className="text-[var(--hg-fg-inverse)]"
        />
      </span>
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p
            className={cn(
              'font-[650] text-(--t-fg)',
              compact ? 'text-xl' : 'text-3xl max-md:text-2xl',
            )}
          >
            {title}
            <span className="sr-only">. {result.scannedValue}.</span>
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
              className="ml-auto"
            >
              Undo
            </Button>
          )}
        </div>
        <p className="font-mono text-lg font-semibold tracking-[0.04em]">{result.scannedValue}</p>
        {details}
        <p className="text-sm text-fg-2">{result.message}</p>
        <p className="flex items-center gap-1.5 text-xs text-fg-3">
          <Icon icon={Volume2} size={12} />
          Cue: {CUE_DESCRIPTIONS[style.sound]}
        </p>
      </div>
    </div>
  )
}
