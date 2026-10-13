import { Table2, ChartColumn } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { IconButton } from '@/components/ui/button'
import type { Tone } from '@/lib/api/types'
import { formatDate, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Small dashboard charts (DESIGN.md §12 + dataviz method): thin marks (≤ 24 px columns with a
 * 4 px rounded data end, 2 px lines), solid hairline grid, current period in the accent
 * (`--hg-viz-now`), everything else de-emphasised (`--hg-viz-muted`). Every chart has a
 * per-mark hover/focus tooltip and a table view; values are never colour-only.
 */

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    setWidth(element.clientWidth)
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

function niceMax(value: number): number {
  if (value <= 4) return Math.max(1, value)
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s * 4 >= value) ?? value
  return Math.ceil(value / step) * step
}

export interface Point {
  date: string
  count: number
}

function TooltipBox({ x, children }: { x: number; children: ReactNode }) {
  return (
    <span
      role="presentation"
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-full rounded-xs bg-fg px-1.5 py-0.5 text-2xs whitespace-nowrap text-fg-inverse"
      style={{ left: x }}
    >
      {children}
    </span>
  )
}

const shortDay = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`))
    .slice(0, 2)

/** Columns per day; `nowIndex` (today) in the accent; max and today labelled on the cap. */
export function ColumnChart({
  points,
  nowIndex,
  label,
  height = 132,
}: {
  points: readonly Point[]
  nowIndex: number
  /** Accessible name ("Completions per day, last 14 days"). */
  label: string
  height?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const axis = 18
  const top = 16
  const plot = height - axis - top
  const max = niceMax(Math.max(0, ...points.map((p) => p.count)))
  const band = points.length > 0 ? width / points.length : 0
  const bar = Math.max(4, Math.min(24, band - 2))
  const y = (v: number) => top + plot - (v / max) * plot
  const peak = points.reduce((best, p, i) => (p.count > (points[best]?.count ?? -1) ? i : best), 0)
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} className="block">
          <line
            x1={0}
            x2={width}
            y1={top + plot + 0.5}
            y2={top + plot + 0.5}
            stroke="var(--hg-viz-axis)"
          />
          <line x1={0} x2={width} y1={top + 0.5} y2={top + 0.5} stroke="var(--hg-viz-grid)" />
          <text x={0} y={top - 4} className="fill-fg-3 text-2xs">
            {formatNumber(max)}
          </text>
          {points.map((p, i) => {
            const cx = band * i + band / 2
            const h = (p.count / max) * plot
            const x0 = cx - bar / 2
            const yTop = y(p.count)
            const r = Math.min(4, h, bar / 2)
            const d =
              h <= 0
                ? ''
                : `M${x0},${top + plot} L${x0},${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} L${x0 + bar - r},${yTop} Q${x0 + bar},${yTop} ${x0 + bar},${yTop + r} L${x0 + bar},${top + plot} Z`
            const showValue = (i === nowIndex || i === peak) && p.count > 0
            return (
              <g key={p.date}>
                {d && (
                  <path
                    d={d}
                    fill={i === nowIndex ? 'var(--hg-viz-now)' : 'var(--hg-viz-muted)'}
                    opacity={hover === null || hover === i ? 1 : 0.6}
                  />
                )}
                {showValue && (
                  <text
                    x={cx}
                    y={yTop - 3}
                    textAnchor="middle"
                    className="fill-fg-2 font-mono text-2xs"
                  >
                    {p.count}
                  </text>
                )}
                {(i === nowIndex || i % 2 === nowIndex % 2) && (
                  <text
                    x={cx}
                    y={height - 4}
                    textAnchor="middle"
                    className={cn(
                      'text-2xs',
                      i === nowIndex ? 'fill-fg font-semibold' : 'fill-fg-3',
                    )}
                  >
                    {i === nowIndex ? 'Today' : shortDay(p.date)}
                  </text>
                )}
                <rect
                  x={band * i}
                  y={top}
                  width={band}
                  height={plot}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${formatDate(p.date)}: ${p.count}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none focus-visible:stroke-focus"
                />
              </g>
            )
          })}
        </svg>
      )}
      {hover !== null && points[hover] && (
        <TooltipBox x={band * hover + band / 2}>
          <b className="font-semibold">{points[hover].count}</b> · {formatDate(points[hover].date)}
        </TooltipBox>
      )}
    </div>
  )
}

/** Line with a 10 % wash, end dot in the accent with a 2 px surface ring, crosshair tooltip. */
export function LineChart({
  points,
  label,
  height = 132,
}: {
  points: readonly Point[]
  label: string
  height?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const gradient = useId()
  const axis = 18
  const top = 16
  const pad = 6
  const plot = height - axis - top
  const max = niceMax(Math.max(0, ...points.map((p) => p.count)))
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0
  const x = (i: number) => pad + i * step
  const y = (v: number) => top + plot - (v / max) * plot
  const line = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.count).toFixed(1)}`)
    .join(' ')
  const last = points.length - 1
  const area = `${line} L${x(last).toFixed(1)},${top + plot} L${x(0).toFixed(1)},${top + plot} Z`
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && points.length > 1 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          className="block"
          onPointerLeave={() => setHover(null)}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            const rel = event.clientX - rect.left
            setHover(Math.max(0, Math.min(last, Math.round((rel - pad) / (step || 1)))))
          }}
        >
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--hg-viz-muted)" stopOpacity="0.1" />
              <stop offset="1" stopColor="var(--hg-viz-muted)" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <line
            x1={0}
            x2={width}
            y1={top + plot + 0.5}
            y2={top + plot + 0.5}
            stroke="var(--hg-viz-axis)"
          />
          <line x1={0} x2={width} y1={top + 0.5} y2={top + 0.5} stroke="var(--hg-viz-grid)" />
          <text x={0} y={top - 4} className="fill-fg-3 text-2xs">
            {formatNumber(max)}
          </text>
          <path d={area} fill={`url(#${gradient})`} />
          <path
            d={line}
            fill="none"
            stroke="var(--hg-viz-muted)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {hover !== null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={top}
              y2={top + plot}
              stroke="var(--hg-viz-axis)"
            />
          )}
          <circle
            cx={x(last)}
            cy={y(points[last]?.count ?? 0)}
            r={4}
            fill="var(--hg-viz-now)"
            stroke="var(--hg-surface)"
            strokeWidth={2}
          />
          <text
            x={x(last) - 6}
            y={y(points[last]?.count ?? 0) - 8}
            textAnchor="end"
            className="fill-fg-2 font-mono text-2xs"
          >
            {points[last]?.count}
          </text>
          {[0, Math.floor(last / 2), last].map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 4}
              textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
              className="fill-fg-3 text-2xs"
            >
              {i === last ? 'Today' : formatDate(points[i]?.date ?? '')}
            </text>
          ))}
        </svg>
      )}
      {hover !== null && points[hover] && (
        <TooltipBox x={x(hover)}>
          <b className="font-semibold">{points[hover].count}</b> · {formatDate(points[hover].date)}
        </TooltipBox>
      )}
    </div>
  )
}

export interface StageSegment {
  key: string
  label: string
  count: number
  tone: Tone
}

/**
 * Part-of-whole across the ordered pipeline stages: one stacked bar (stage tones, 2 px surface
 * gaps) + a legend table that carries every value (identity is never colour-only).
 */
export function StageBar({
  segments,
  label,
}: {
  segments: readonly StageSegment[]
  label: string
}) {
  const [hover, setHover] = useState<string | null>(null)
  const total = segments.reduce((sum, s) => sum + s.count, 0)
  return (
    <div className="grid gap-3">
      <div role="img" aria-label={label} className="flex h-4 gap-0.5 overflow-hidden rounded-xs">
        {total === 0 ? (
          <span className="h-full flex-1 bg-pressed" />
        ) : (
          segments
            .filter((s) => s.count > 0)
            .map((s) => (
              <span
                key={s.key}
                title={`${s.label}: ${s.count}`}
                onPointerEnter={() => setHover(s.key)}
                onPointerLeave={() => setHover(null)}
                className={cn(
                  `hg-tone-${s.tone} h-full bg-(--t) first:rounded-l-xs last:rounded-r-xs`,
                  hover && hover !== s.key && 'opacity-60',
                )}
                style={{ flexGrow: s.count, flexBasis: 0, minWidth: 2 }}
              />
            ))
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>Stage</th>
            <th>Requests</th>
            <th>Share</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s) => (
            <tr
              key={s.key}
              className={cn('h-6', hover === s.key && 'bg-hover')}
              onPointerEnter={() => setHover(s.key)}
              onPointerLeave={() => setHover(null)}
            >
              <td className="pr-2">
                <span className="inline-flex items-center gap-2 text-fg-2">
                  <span className={`hg-tone-${s.tone} size-2.5 rounded-2xs bg-(--t)`} aria-hidden />
                  {s.label}
                </span>
              </td>
              <td className="text-right font-mono tabular-nums">{formatNumber(s.count)}</td>
              <td className="w-14 text-right font-mono text-xs text-fg-3 tabular-nums">
                {total ? `${Math.round((s.count / total) * 100)} %` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Chart panel with a chart ↔ table toggle (DESIGN §12: every chart has a table view). */
export function ChartCard({
  title,
  subtitle,
  table,
  children,
  className,
}: {
  title: string
  subtitle?: ReactNode
  /** Rows for the table view: first column label, second value. */
  table?: readonly { label: string; value: ReactNode }[]
  children: ReactNode
  className?: string
}) {
  const [asTable, setAsTable] = useState(false)
  return (
    <section
      className={cn(
        'grid content-start gap-2 rounded-sm border border-line bg-surface p-4',
        className,
      )}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-fg-3">{subtitle}</p>}
        </div>
        {table && (
          <IconButton
            className="ml-auto"
            size="sm"
            icon={asTable ? ChartColumn : Table2}
            label={asTable ? 'Show chart' : 'Show table'}
            aria-pressed={asTable}
            onClick={() => setAsTable((v) => !v)}
          />
        )}
      </header>
      {asTable && table ? (
        <div className="max-h-[132px] overflow-y-auto">
          <table className="w-full text-sm">
            <tbody>
              {table.map((row) => (
                <tr key={row.label} className="h-6 border-b border-line-subtle last:border-0">
                  <td className="text-fg-2">{row.label}</td>
                  <td className="text-right font-mono tabular-nums">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  )
}
