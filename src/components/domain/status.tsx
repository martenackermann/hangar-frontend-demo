import { Copy, Crown, Timer } from 'lucide-react'
import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/icon'
import { notify } from '@/components/ui/toast'
import type { ImportJobSummary, PipelineStage, Tone } from '@/lib/api/types'
import { findEnumValue, useEnums, type EnumKey } from '@/lib/enums'
import { formatDate, toDate, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SPINNING, statusIcon } from './status-meta'

// ---- IdInk -----------------------------------------------------------------------------------

/**
 * Identifier with significant-digit ink (DESIGN.md §4.2, §15): prefix and leading zeros recede
 * (`SR00`**`12388`**). Serials pass `whole`. Copy yields the full string (one text node split
 * by spans only).
 */
export function IdInk({
  value,
  whole = false,
  className,
}: {
  value: string | null | undefined
  whole?: boolean
  className?: string
}) {
  if (!value) return <span className="text-fg-disabled">—</span>
  const match = whole ? null : /^([A-Z]+-?0*)(.*)$/.exec(value)
  return (
    <span className={cn('hg-mono whitespace-nowrap text-fg', className)}>
      {match?.[1] ? (
        <>
          <span className="text-fg-3">{match[1]}</span>
          {match[2]}
        </>
      ) : (
        value
      )}
    </span>
  )
}

/** IdInk + copy button (drawer headers). */
export function CopyableId({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <IdInk value={value} />
      <button
        type="button"
        aria-label={`Copy ${value}`}
        onClick={() => {
          void navigator.clipboard
            ?.writeText(value)
            .then(() => notify.success(`${value} copied`, { duration: 2000 }))
        }}
        className="grid size-6 place-items-center rounded-sm text-fg-3 hover:bg-hover hover:text-fg"
      >
        <Icon icon={Copy} size={14} />
      </button>
    </span>
  )
}

// ---- StageTrack -------------------------------------------------------------------------------

/**
 * StageTrack (DESIGN.md §3.1): 8 ticks 3×12 px, 2 px gap. Passed stages tone at 42 %, current
 * 100 %, future `--hg-line`. Tone = the current state's tone.
 */
export function StageTrack({
  stage,
  tone,
  label,
  className,
}: {
  stage: PipelineStage
  tone: Tone
  /** Status label for the tooltip ("Escalated · stage 2 of 8"). */
  label?: string
  className?: string
}) {
  const enums = useEnums()
  const stages = enums.pipelineStage
  const index = stages.findIndex((entry) => entry.value === stage)
  const position = index + 1
  return (
    <span
      role="img"
      aria-label={`${label ? `${label} · ` : ''}stage ${position} of ${stages.length}`}
      title={`${label ? `${label} · ` : ''}stage ${position} of ${stages.length}`}
      className={cn(
        `hg-track hg-tone-${tone} inline-flex h-3 shrink-0 items-center gap-0.5`,
        className,
      )}
    >
      {stages.map((entry, i) => (
        <i
          key={entry.value}
          className={cn(
            'block h-3 w-[3px] rounded-[1px]',
            i < index && 'bg-[color-mix(in_srgb,var(--t)_42%,transparent)]',
            i === index && 'bg-(--t)',
            i > index && 'bg-line',
          )}
        />
      ))}
    </span>
  )
}

// ---- StatusBadge ------------------------------------------------------------------------------

export interface StatusBadgeProps {
  /** Enum key, e.g. `serviceRequestStatus`, `assetStatus`, `tourStatus`. */
  entity: EnumKey
  state: string
  /** `quiet` in tables (icon + label, no fill); `wash` in drawer headers / exceptions. */
  variant?: 'quiet' | 'wash'
  /** SR only: prefix the 8-tick StageTrack. */
  withTrack?: boolean
  size?: 'sm' | 'md'
  /** Override the label (e.g. "Available · B4-12", "Imported 412 / 1,312"). */
  label?: string
  /** VIP flag next to the status. */
  vip?: boolean
  /** Tooltip extra line ("since 2 Oct"). */
  since?: string | null
  /** Override the tone (e.g. import completed with warnings → caution, SPEC_RESOLUTIONS #56). */
  tone?: Tone | null
  className?: string
}

/**
 * Status = icon + label coloured by its tone (DESIGN.md §3). Caution and critical states always
 * render as `wash`; everything else is quiet unless asked. Label and tone come from
 * `/meta/enums`, icons from `status-meta.ts`.
 */
export function StatusBadge({
  entity,
  state,
  variant = 'quiet',
  withTrack,
  size = 'md',
  label,
  vip,
  since,
  tone: toneOverride,
  className,
}: StatusBadgeProps) {
  const enums = useEnums()
  const meta = findEnumValue(enums, entity, state)
  const tone: Tone = toneOverride ?? meta?.tone ?? 'intake'
  const text = label ?? meta?.label ?? state
  const icon = statusIcon(entity, state)
  const wash = variant === 'wash' || tone === 'caution' || tone === 'critical'
  const stage = meta?.stage
  const stageIndex = stage ? enums.pipelineStage.findIndex((s) => s.value === stage) + 1 : 0
  const tooltip = [
    text,
    stage ? `stage ${stageIndex} of ${enums.pipelineStage.length}` : null,
    since ? `since ${formatDate(since)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const badge = (
    <span
      className={cn(
        `hg-tone-${tone} inline-flex min-w-0 items-center whitespace-nowrap`,
        wash
          ? 'hg-badge h-badge gap-[5px] rounded-xs bg-(--t-wash) pr-1.5 pl-[5px] text-xs font-medium text-(--t-fg) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--t)_28%,transparent)]'
          : cn('gap-2 text-fg', size === 'sm' && 'text-xs'),
        className,
      )}
    >
      <Icon
        icon={icon}
        size={wash || size === 'sm' ? 12 : 14}
        className={cn('text-(--t)', SPINNING.has(icon) && 'animate-spin')}
      />
      <span className="truncate">{text}</span>
    </span>
  )

  return (
    <span className="inline-flex min-w-0 items-center gap-2" title={tooltip}>
      {withTrack && stage && <StageTrack stage={stage} tone={tone} label={text} />}
      {badge}
      {vip && <VipFlag />}
    </span>
  )
}

export function VipFlag() {
  return (
    <span className="hg-badge inline-flex h-badge items-center gap-1 rounded-xs px-1.5 text-xs font-medium text-fg-2 shadow-[inset_0_0_0_1px_var(--hg-line)]">
      <Icon icon={Crown} size={12} />
      VIP
    </span>
  )
}

/** Import jobs completed with warnings render in tone `caution` (SPEC_RESOLUTIONS #56). */
export function importJobTone(job: Pick<ImportJobSummary, 'status' | 'counts'>): Tone | null {
  return job.status === 'completed' && job.counts.warnings > 0 ? 'caution' : null
}

// ---- Aging ---------------------------------------------------------------------------------------

/** Stage SLAs in days (DESIGN.md §3.5; frontend constants per SPEC_RESOLUTIONS #56). */
export const STAGE_SLA_DAYS: Record<PipelineStage, number | null> = {
  imported: 2,
  invited: 10,
  booked: 14,
  personalizing: 3,
  ready: 2,
  delivery: 3,
  deployed: 5,
  closed: null,
}

export type AgingLevel = 'fresh' | 'aging' | 'overdue'

export interface Aging {
  days: number
  hours: number
  slaDays: number | null
  level: AgingLevel
}

export function computeAging(since: string, stage: PipelineStage, now = new Date()): Aging {
  const ms = Math.max(0, now.getTime() - toDate(since).getTime())
  const hours = Math.floor(ms / 3_600_000)
  const days = Math.floor(hours / 24)
  const slaDays = STAGE_SLA_DAYS[stage]
  const ratio = slaDays ? ms / (slaDays * 86_400_000) : 0
  const level: AgingLevel = !slaDays || ratio <= 0.6 ? 'fresh' : ratio <= 1 ? 'aging' : 'overdue'
  return { days, hours, slaDays, level }
}

/**
 * AgingIndicator (DESIGN.md §3.5): fresh = muted mono `4d`; aging = timer + caution-fg;
 * overdue = filled critical chip `⏱ 9d`. Tooltip: "9 days in stage · SLA 2 days".
 */
export function AgingIndicator({
  since,
  stage,
  variant = 'text',
  className,
}: {
  since: string
  stage: PipelineStage
  variant?: 'text' | 'chip'
  className?: string
}) {
  const aging = computeAging(since, stage)
  const text = aging.days >= 1 ? `${aging.days}d` : `${aging.hours}h`
  const tooltip = `${aging.days >= 1 ? plural(aging.days, 'day') : plural(aging.hours, 'hour')} in stage${
    aging.slaDays ? ` · SLA ${aging.slaDays} days` : ''
  }${aging.level === 'overdue' ? ' · overdue' : ''}`
  const overdue = aging.level === 'overdue'
  return (
    <span
      title={tooltip}
      className={cn(
        'inline-flex h-[18px] items-center gap-[3px] font-mono text-[11.5px] whitespace-nowrap',
        aging.level === 'fresh' && 'text-fg-3',
        aging.level === 'aging' && 'text-tone-caution-fg',
        overdue &&
          'rounded-xs bg-tone-critical-wash pr-[5px] pl-1 font-semibold text-tone-critical-fg shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--hg-tone-critical)_30%,transparent)]',
        variant === 'chip' && !overdue && 'px-1',
        className,
      )}
    >
      {aging.level !== 'fresh' && <Icon icon={Timer} size={12} />}
      <span className="sr-only">{tooltip}: </span>
      {text}
    </span>
  )
}

// ---- The Line (drawer scale) -----------------------------------------------------------------------

export interface LineStation {
  stage: PipelineStage
  /** Date the request reached this stage (passed stations). */
  date?: string | null
}

/**
 * The Line at record scale (DESIGN.md §1): the request's stations with dates under each passed
 * station and an amber ring on "now".
 */
export function StageLine({
  current,
  tone,
  stations,
  header,
}: {
  current: PipelineStage
  tone: Tone
  stations: readonly LineStation[]
  header?: ReactNode
}) {
  const enums = useEnums()
  const stages = enums.pipelineStage
  const currentIndex = stages.findIndex((s) => s.value === current)
  return (
    <div className="rounded-sm border border-line bg-surface px-3 pt-2.5 pb-2">
      {header && <div className="mb-2.5 flex justify-between text-xs">{header}</div>}
      <ol className={`hg-tone-${tone} grid grid-cols-[repeat(7,minmax(0,1fr))_12px]`}>
        {stages.map((stage, index) => {
          const station = stations.find((s) => s.stage === stage.value)
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'now' : 'future'
          return (
            <li
              key={stage.value}
              aria-current={state === 'now' ? 'step' : undefined}
              title={stage.label}
              className="relative grid justify-items-start gap-1"
            >
              {index < stages.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-[5px] right-0 h-0.5',
                    index === 0 ? 'left-1.5' : 'left-0',
                    index < currentIndex ? 'bg-fg-3' : 'bg-line',
                  )}
                />
              )}
              <span
                aria-hidden
                className={cn(
                  'relative size-3 rounded-full',
                  state === 'done' && 'bg-fg-3',
                  state === 'now' &&
                    'bg-(--t) shadow-[0_0_0_2px_var(--hg-surface),0_0_0_4px_var(--hg-accent)]',
                  state === 'future' && 'bg-surface shadow-[inset_0_0_0_2px_var(--hg-line-strong)]',
                )}
              />
              <span
                className={cn(
                  'min-h-3.5 font-mono text-[11px] whitespace-nowrap',
                  state === 'now' ? 'text-fg' : 'text-fg-3',
                )}
              >
                {station?.date ? formatDate(station.date, { weekday: false, year: false }) : ''}
              </span>
              <span className="sr-only">
                {stage.label}
                {state === 'now' ? ' (current)' : state === 'done' ? ' (passed)' : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
