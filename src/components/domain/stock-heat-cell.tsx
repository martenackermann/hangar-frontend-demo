import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/icon'
import type { StockCell } from '@/lib/api/types'
import { cn } from '@/lib/utils'

/**
 * Call-off maths (SPEC_RESOLUTIONS #18): `orderQty = max(0, demand + buffer − stock)`.
 * Shortage ratio drives the heat ramp (DESIGN.md §10 StockHeatCell).
 */
export function orderQuantity(cell: Pick<StockCell, 'demand' | 'buffer' | 'stock'>): number {
  return Math.max(0, cell.demand + cell.buffer - cell.stock)
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4 | 'surplus'

export function heatLevel(cell: Pick<StockCell, 'demand' | 'buffer' | 'stock'>): HeatLevel {
  const need = cell.demand + cell.buffer
  if (need > 0 && cell.stock > 2 * need) return 'surplus'
  if (need === 0) return 0
  const shortage = Math.max(0, need - cell.stock) / need
  if (shortage === 0) return 0
  if (shortage < 0.25) return 1
  if (shortage < 0.5) return 2
  if (shortage < 0.75) return 3
  return 4
}

const HEAT_BG: Record<string, string> = {
  '0': 'bg-heat-0',
  '1': 'bg-heat-1',
  '2': 'bg-heat-2',
  '3': 'bg-heat-3',
  '4': 'bg-heat-4',
  surplus: 'bg-heat-surplus',
}

const HEAT_WORDS: Record<string, string> = {
  '1': 'shortage under 25 %',
  '2': 'shortage 25–50 %',
  '3': 'shortage 50–75 %',
  '4': 'critical shortage, 75 % or more',
  surplus: 'surplus, above twice demand plus buffer',
}

/**
 * Words for the heat step, for screen readers ("shortage 25–50 %"); `null` when covered.
 * Use it in an accessible name that replaces the cell's content (e.g. a wrapping button's
 * `aria-label`).
 */
export function heatLabel(cell: Pick<StockCell, 'demand' | 'buffer' | 'stock'>): string | null {
  return HEAT_WORDS[String(heatLevel(cell))] ?? null
}

export const HEAT_LEGEND: { level: HeatLevel; label: string }[] = [
  { level: 0, label: 'Covered' },
  { level: 1, label: '< 25 % short' },
  { level: 2, label: '25–50 % short' },
  { level: 3, label: '50–75 % short' },
  { level: 4, label: '≥ 75 % short' },
  { level: 'surplus', label: 'Above 2× demand + buffer' },
]

/**
 * One cell of the stock matrix: stock (mono 14/600, top-left) · "demand 42 · buffer 5" ·
 * order suggestion chip `+18` (top-right) when > 0. Background = shortage ramp; level 4 adds
 * an alert icon. Text stays `--hg-fg` (≥ 7 : 1 on every step). The heat step is also written
 * out for screen readers ("shortage 25–50 %"), so it is never colour-only. Wrap in a
 * button/popover to edit (a wrapper with its own `aria-label` should include `heatLabel(cell)`).
 */
export function StockHeatCell({
  cell,
  className,
  children,
}: {
  cell: Pick<StockCell, 'demand' | 'buffer' | 'stock'>
  className?: string
  /** Extra content (e.g. min/max flags). */
  children?: ReactNode
}) {
  const level = heatLevel(cell)
  const order = orderQuantity(cell)
  const words = heatLabel(cell)
  return (
    <div
      className={cn(
        'relative grid min-h-12 content-between gap-0.5 px-2 py-1.5 text-fg',
        HEAT_BG[String(level)],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1 font-mono text-md font-semibold">
          {level === 4 && <Icon icon={TriangleAlert} size={12} />}
          {cell.stock}
          {words && <span className="sr-only">, {words}</span>}
        </span>
        {order > 0 && (
          <span
            className="rounded-xs px-1 font-mono text-xs shadow-[inset_0_0_0_1px_var(--hg-line-strong)]"
            title="Suggested order quantity"
          >
            +{order}
          </span>
        )}
      </div>
      <span className="text-[11px] text-fg-2">
        demand {cell.demand} · buffer {cell.buffer}
      </span>
      {children}
    </div>
  )
}

export function HeatLegend() {
  return (
    <ul
      className="flex flex-wrap items-center gap-3 text-xs text-fg-2"
      aria-label="Shortage legend"
    >
      {HEAT_LEGEND.map((item) => (
        <li key={String(item.level)} className="flex items-center gap-1.5">
          <span
            className={cn('size-3 rounded-2xs border border-line', HEAT_BG[String(item.level)])}
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
