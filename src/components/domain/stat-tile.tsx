import { Link, type LinkProps } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, OctagonX, TriangleAlert } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

/**
 * Sparkline (DESIGN.md §10): 76 × 28, 12 points, 1.5 px muted line + 14 % wash, last point amber
 * with a 2 px surface ring; hover shows a crosshair tooltip (label · value).
 */
export function Sparkline({
  points,
  labels,
  width = 76,
  height = 28,
  className,
}: {
  points: readonly number[]
  /** One label per point for the hover tooltip (e.g. "Week 41"). */
  labels?: readonly string[]
  width?: number
  height?: number
  className?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const gradientId = useId()
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const pad = 3
  const x = (i: number) => pad + (i * (width - pad * 2)) / (points.length - 1)
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2)
  const line = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ')
  const area = `${line} L${x(points.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`
  const last = points.length - 1
  return (
    <span className={cn('relative inline-block', className)}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Trend: ${points.join(', ')}`}
        className="block overflow-visible"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const rel = ((event.clientX - rect.left) / rect.width) * width
          setHover(
            Math.max(0, Math.min(last, Math.round(((rel - pad) / (width - pad * 2)) * last))),
          )
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--hg-viz-muted)" stopOpacity="0.14" />
            <stop offset="1" stopColor="var(--hg-viz-muted)" stopOpacity="0.14" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} stroke="none" />
        <path
          d={line}
          fill="none"
          stroke="var(--hg-viz-muted)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={0}
            y2={height}
            stroke="var(--hg-viz-axis)"
            strokeWidth={1}
          />
        )}
        <circle
          cx={x(last)}
          cy={y(points[last] ?? 0)}
          r={2.5}
          fill="var(--hg-viz-now)"
          stroke="var(--hg-surface)"
          strokeWidth={2}
        />
      </svg>
      {hover !== null && (
        <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 rounded-xs bg-fg px-1.5 py-0.5 text-2xs whitespace-nowrap text-fg-inverse">
          {labels?.[hover] ? `${labels[hover]} · ` : ''}
          {points[hover]}
        </span>
      )}
    </span>
  )
}

export interface StatTileProps {
  label: string
  value: ReactNode
  unit?: ReactNode
  /** Signed delta, coloured by direction × good. */
  delta?: { value: number; text: ReactNode; goodWhen: 'up' | 'down' }
  /** Context line when there is no delta. */
  context?: ReactNode
  /** caution / critical add an alert icon to the label. */
  alert?: 'caution' | 'critical'
  spark?: readonly number[]
  sparkLabels?: readonly string[]
  /** The tile links to the filtered list. */
  to?: LinkProps['to']
  search?: LinkProps['search']
  className?: string
}

/**
 * StatTile (DESIGN.md §10): label (12 fg-3) · value (24/600 semi-condensed, proportional) ·
 * delta/context · sparkline. Lives in a hairline-divided `<KpiStrip>`, max six per strip.
 */
export function StatTile({
  label,
  value,
  unit,
  delta,
  context,
  alert,
  spark,
  sparkLabels,
  to,
  search,
  className,
}: StatTileProps) {
  const good = delta ? (delta.goodWhen === 'up' ? delta.value >= 0 : delta.value <= 0) : true
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-xs text-fg-3">
        {alert && (
          <Icon
            icon={alert === 'critical' ? OctagonX : TriangleAlert}
            size={12}
            className={alert === 'critical' ? 'text-tone-critical' : 'text-tone-caution'}
          />
        )}
        {label}
      </span>
      <span className="flex items-end justify-between gap-2">
        <span className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold [font-stretch:87.5%] [font-variant-numeric:proportional-nums]">
            {value}
          </span>
          {unit && <span className="text-sm text-fg-3">{unit}</span>}
        </span>
        {spark && <Sparkline points={spark} labels={sparkLabels} />}
      </span>
      {delta ? (
        <span
          className={cn(
            'flex items-center gap-1 text-xs',
            good ? 'text-tone-done-fg' : 'text-tone-critical-fg',
          )}
        >
          <Icon icon={delta.value >= 0 ? ArrowUp : ArrowDown} size={12} />
          {delta.text}
        </span>
      ) : context ? (
        <span className="text-xs text-fg-3">{context}</span>
      ) : null}
    </>
  )
  const cls = cn(
    'grid min-w-0 gap-1 px-4 py-3',
    to &&
      'hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
    className,
  )
  return to ? (
    <Link to={to} search={search} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** Hairline-divided strip of StatTiles; the sixth tile hides below 1360 px. */
export function KpiStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid auto-cols-fr grid-flow-col divide-x divide-line border-b border-line bg-surface max-md:grid-flow-row max-md:grid-cols-2 max-md:divide-x-0 [&>*:nth-child(6)]:max-[1359px]:hidden">
      {children}
    </div>
  )
}
