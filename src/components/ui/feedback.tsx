import type { LucideIcon } from 'lucide-react'
import { Progress } from 'radix-ui'
import type { CSSProperties, ReactNode } from 'react'
import type { Tone } from '@/lib/api/types'
import { cn } from '@/lib/utils'
import { Icon } from './icon'

/**
 * EmptyState (DESIGN.md §10): centred, max 360 px, 40 px icon tile, title states the situation,
 * one teaching sentence, one primary action and an optional secondary.
 */
export function EmptyState({
  icon,
  title,
  children,
  actions,
  className,
}: {
  icon: LucideIcon
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'mx-auto flex max-w-[360px] flex-col items-center gap-2 px-4 py-10 text-center',
        className,
      )}
    >
      <span className="mb-1 grid size-10 place-items-center rounded-sm bg-pressed text-fg-3">
        <Icon icon={icon} size={20} />
      </span>
      <p className="text-md font-semibold text-fg">{title}</p>
      {children && <p className="text-sm text-fg-2">{children}</p>}
      {actions && <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  )
}

/** Skeleton bar (first load only — refetches keep the previous render at 60 % opacity). */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={cn('hg-skeleton block h-2', className)} style={style} />
}

/**
 * Loading region around skeletons: a polite status that says "Loading…" to screen readers
 * while the bars stay decorative. `<LoadingStatus className="grid gap-3 p-4"><Skeleton …/></LoadingStatus>`.
 */
export function LoadingStatus({
  children,
  label = 'Loading…',
  className,
}: {
  children?: ReactNode
  label?: string
  className?: string
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

/** Skeleton rows at real column widths. */
export function SkeletonRows({
  rows = 8,
  widths = [72, 140, 120, 90, 110],
}: {
  rows?: number
  widths?: number[]
}) {
  return (
    <LoadingStatus className="grid">
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="flex h-row items-center gap-6 border-b border-line-subtle px-cell"
        >
          {widths.map((width, col) => (
            <Skeleton key={col} style={{ width: width * (0.7 + ((row * 7 + col * 3) % 5) / 10) }} />
          ))}
        </div>
      ))}
    </LoadingStatus>
  )
}

export interface MeterSegment {
  value: number
  /** Tone mark colour; `accent` = the location being counted right now. */
  tone: Tone | 'accent' | 'neutral'
  label?: string
}

/**
 * ProgressMeter (DESIGN.md §10): 6 px (inline) or 10 px (scan station) track, 2 px gaps between
 * segments, tone marks; always paired with numbers by the caller. Radix Progress with
 * `aria-valuetext` ("598 of 640 counted").
 */
export function ProgressMeter({
  segments,
  max,
  label,
  valueText,
  size = 'inline',
  className,
}: {
  segments: readonly MeterSegment[]
  max: number
  label: string
  valueText: string
  size?: 'inline' | 'station'
  className?: string
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  return (
    <Progress.Root
      value={Math.min(total, max)}
      max={max || 1}
      aria-label={label}
      getValueLabel={() => valueText}
      className={cn(
        'hg-meter flex gap-0.5 overflow-hidden rounded-2xs bg-pressed',
        size === 'inline' ? 'h-1.5' : 'h-2.5',
        className,
      )}
    >
      {segments
        .filter((segment) => segment.value > 0)
        .map((segment, index) => (
          <span
            key={index}
            title={segment.label}
            className={cn(
              'block h-full rounded-2xs',
              segment.tone === 'accent'
                ? 'bg-accent'
                : segment.tone === 'neutral'
                  ? 'bg-fg-3'
                  : `hg-tone-${segment.tone} bg-(--t)`,
            )}
            style={{ width: `${max > 0 ? (segment.value / max) * 100 : 0}%` }}
          />
        ))}
    </Progress.Root>
  )
}

/** Initials avatar (22 px), optional tone (workshop wash for editors). */
export function Avatar({
  name,
  initials,
  size = 22,
  tone,
  className,
}: {
  name: string
  initials?: string
  size?: 18 | 22 | 28 | 40
  tone?: Tone
  className?: string
}) {
  const letters =
    initials ??
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
  return (
    <span
      title={name}
      aria-hidden
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-semibold tracking-[0.02em]',
        tone ? `hg-tone-${tone} bg-(--t-wash) text-(--t-fg)` : 'bg-pressed text-fg',
        className,
      )}
      style={{ width: size, height: size, fontSize: size <= 22 ? 11 : size <= 28 ? 12 : 15 }}
    >
      {letters}
    </span>
  )
}

/**
 * Small neutral outlined badge for flags (VIP crown, Campus, OS reinstall). Never wider than its
 * container: long text truncates with an ellipsis.
 */
export function FlagBadge({
  icon,
  children,
  className,
}: {
  icon?: LucideIcon
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'hg-badge inline-flex h-badge max-w-full min-w-0 items-center gap-1 overflow-hidden rounded-xs px-1.5 text-xs font-medium whitespace-nowrap text-fg-2 shadow-[inset_0_0_0_1px_var(--hg-line)]',
        className,
      )}
    >
      {icon && <Icon icon={icon} size={12} className="text-fg-2" />}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

/**
 * Tone-washed badge (for non-status tones such as warnings counts). Never wider than its
 * container: long text truncates with an ellipsis (pipeline cards, narrow columns).
 */
export function ToneBadge({
  tone,
  icon,
  children,
  className,
}: {
  tone: Tone
  icon?: LucideIcon
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        `hg-badge hg-tone-${tone} inline-flex h-badge max-w-full min-w-0 items-center gap-1 overflow-hidden rounded-xs bg-(--t-wash) pr-1.5 pl-[5px] text-xs font-medium whitespace-nowrap text-(--t-fg) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--t)_28%,transparent)]`,
        className,
      )}
    >
      {icon && <Icon icon={icon} size={12} className="text-(--t)" />}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

/** Inline notice / banner (version conflicts, sync failures, info). */
export function Banner({
  tone = 'outreach',
  icon,
  title,
  children,
  actions,
  className,
}: {
  tone?: Tone
  icon: LucideIcon
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      role={tone === 'critical' ? 'alert' : 'status'}
      className={cn(
        `hg-tone-${tone} flex items-start gap-2.5 rounded-sm border border-[color-mix(in_srgb,var(--t)_35%,transparent)] bg-(--t-wash) px-3 py-2.5`,
        className,
      )}
    >
      <Icon icon={icon} className="mt-0.5 text-(--t)" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-(--t-fg)">{title}</p>
        {children && <div className="mt-0.5 text-xs text-fg-2">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
