import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Boxes,
  ChevronDown,
  Download,
  FilePlus2,
  Filter,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'
import { useMemo, useState, type KeyboardEvent } from 'react'
import { FilterBar, type FilterDef } from '@/components/data-table/filter-bar'
import { HeatLegend, StockHeatCell } from '@/components/domain/stock-heat-cell'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Banner, EmptyState, SkeletonRows } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { Page, PageHeader } from '@/components/ui/page'
import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'
import { downloadFrom } from '@/lib/api/downloads'
import type { StockCell, StockMatrix } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { useEnums } from '@/lib/enums'
import { formatDate, formatNumber, formatRelative } from '@/lib/format'
import { useShortcut } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import {
  exportRequest,
  stockQueries,
  useRecalculate,
  useUpdateBuffers,
  type MatrixParams,
} from '../api'
import { CreateCallOffDialog } from './create-calloff-dialog'

export type MatrixSort = 'number' | 'name' | 'orderQty'

export interface MatrixSearch {
  siteId?: number[] | undefined
  category?: string[] | undefined
  q?: string | undefined
  onlyShortfall?: boolean | undefined
  includeInactive?: boolean | undefined
  sort?: MatrixSort | undefined
}

type Row = StockMatrix['rows'][number]

function cellTooltip(cell: StockCell): string {
  const parts = [
    `Goods in ${cell.goodsIn} · Staging ${cell.staging} · Goods out ${cell.goodsOut}`,
    `Order = max(0, ${cell.demand} demand + ${cell.buffer} buffer − ${cell.stock} stock) = ${cell.orderQty}`,
  ]
  if (cell.minQty !== null || cell.maxQty !== null)
    parts.push(`Min ${cell.minQty ?? '—'} · Max ${cell.maxQty ?? '—'}`)
  if (cell.lastOrderDate)
    parts.push(`Last ordered ${formatDate(cell.lastOrderDate)} (${cell.lastOrderedQty ?? 0})`)
  return parts.join(' · ')
}

/** Buffer input: saved on blur/Enter (optimistic), ↑/↓ move to the same hub in the next row. */
function BufferInput({
  cell,
  articleId,
  row,
  col,
  label,
}: {
  cell: StockCell
  articleId: number
  row: number
  col: number
  label: string
}) {
  const mutation = useUpdateBuffers()
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? String(cell.buffer)
  const commit = () => {
    if (draft === null) return
    const next = Number(draft)
    setDraft(null)
    if (!Number.isInteger(next) || next < 0 || next === cell.buffer) return
    mutation.mutate({ siteId: cell.siteId, buffers: [{ articleId, bufferQty: next }] })
  }
  const move = (event: KeyboardEvent<HTMLInputElement>, dRow: number, dCol: number) => {
    const target = document.querySelector<HTMLInputElement>(
      `[data-buffer-row="${row + dRow}"][data-buffer-col="${col + dCol}"]`,
    )
    if (target) {
      event.preventDefault()
      commit()
      target.focus()
      target.select()
    }
  }
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      data-buffer-row={row}
      data-buffer-col={col}
      value={value}
      onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
      onFocus={(event) => event.target.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          setDraft(null)
          event.currentTarget.blur()
        } else if (event.key === 'ArrowDown') move(event, 1, 0)
        else if (event.key === 'ArrowUp') move(event, -1, 0)
        else if (event.key === 'ArrowRight' && event.altKey) move(event, 0, 1)
        else if (event.key === 'ArrowLeft' && event.altKey) move(event, 0, -1)
      }}
      className={cn(
        'h-7 w-11 rounded-xs border border-line bg-transparent px-1.5 text-right font-mono text-sm outline-none',
        'hover:border-line-strong focus:border-focus focus:bg-sunken focus:shadow-[0_0_0_1px_var(--hg-focus)]',
        mutation.isError && 'border-tone-critical',
      )}
    />
  )
}

function sortRows(rows: readonly Row[], sort: MatrixSort | undefined): Row[] {
  const copy = [...rows]
  if (sort === 'name') copy.sort((a, b) => a.article.name.localeCompare(b.article.name))
  else if (sort === 'orderQty')
    copy.sort(
      (a, b) =>
        b.totals.orderQty - a.totals.orderQty || a.article.number.localeCompare(b.article.number),
    )
  return copy
}

export function MatrixPage({
  search,
  onSearchChange,
}: {
  search: MatrixSearch
  onSearchChange: (patch: Record<string, unknown>) => void
}) {
  const enums = useEnums()
  const canBuffers = useCan('stock.buffers')
  const canRecalc = useCan('stock.recalculate')
  const canExport = useCan('assets.export')
  const canOrder = useCan('calloff.manage')
  const recalc = useRecalculate()
  const [orderFor, setOrderFor] = useState<number | null>(null)

  const params: MatrixParams = {
    siteId: search.siteId,
    category: search.category,
    q: search.q,
    onlyShortfall: search.onlyShortfall,
    includeInactive: search.includeInactive,
  }
  const query = useQuery(stockQueries.matrix(params))
  const matrix = query.data
  const rows = useMemo(() => sortRows(matrix?.rows ?? [], search.sort), [matrix, search.sort])
  const allHubs = useQuery(stockQueries.matrix({})).data?.sites ?? matrix?.sites ?? []

  useShortcut('r', () => canRecalc && recalc.mutate(), {
    description: 'Recalculate stock',
    group: 'Screen',
    enabled: canRecalc,
  })

  const filters: FilterDef[] = [
    {
      kind: 'multi',
      key: 'siteId',
      label: 'Hub',
      options: allHubs.map((s) => ({ value: String(s.id), label: s.name })),
    },
    {
      kind: 'multi',
      key: 'category',
      label: 'Category',
      options: enums.articleCategory.map((c) => ({ value: c.value, label: c.label })),
    },
    {
      kind: 'boolean',
      key: 'onlyShortfall',
      label: 'Shortfall only',
      trueLabel: 'Only rows with an order or shortfall',
    },
    {
      kind: 'boolean',
      key: 'includeInactive',
      label: 'Inactive articles',
      trueLabel: 'Include inactive',
    },
  ]

  const unmatched = matrix?.meta.unmatchedDemand.reduce((sum, u) => sum + u.count, 0) ?? 0
  const unresolved = matrix?.meta.unresolvedDemand ?? 0
  const sites = matrix?.sites ?? []
  const categoryLabel = (value: string) =>
    enums.articleCategory.find((c) => c.value === value)?.label ?? value

  return (
    <Page>
      <PageHeader
        title="Stock matrix"
        meta={
          matrix
            ? `${matrix.calculatedAt ? `Calculated ${formatRelative(matrix.calculatedAt)}` : 'Never calculated'} · ${rows.length} articles × ${sites.length} hubs`
            : 'Stock vs demand per article and hub'
        }
        actions={
          <>
            {canExport && (
              <Button
                icon={Download}
                onClick={() => void downloadFrom(exportRequest('/stock/export', params))}
              >
                Export CSV
              </Button>
            )}
            {canRecalc && (
              <Button
                variant="primary"
                icon={RefreshCw}
                shortcut="r"
                loading={recalc.isPending || matrix?.meta.recalculating}
                onClick={() => recalc.mutate()}
              >
                {matrix?.meta.recalculating ? 'Recalculating…' : 'Recalculate'}
              </Button>
            )}
          </>
        }
      />
      <FilterBar
        search={search as Record<string, unknown>}
        onSearchChange={onSearchChange}
        filters={filters}
        searchPlaceholder="Filter by article number, name, device type…"
        resultCount={matrix?.rows.length}
        end={
          <Select<MatrixSort>
            label="Sort"
            prefix="Sort"
            value={search.sort ?? 'number'}
            onValueChange={(sort) => onSearchChange({ sort: sort === 'number' ? undefined : sort })}
            options={[
              { value: 'number', label: 'Article number' },
              { value: 'name', label: 'Name' },
              { value: 'orderQty', label: 'Order quantity' },
            ]}
          />
        }
      />
      <div className="flex flex-wrap items-center gap-3 px-4 py-2">
        <HeatLegend />
        {(unmatched > 0 || unresolved > 0) && (
          <Banner
            tone="caution"
            icon={TriangleAlert}
            className="ml-auto"
            title={[
              unmatched > 0 ? `${unmatched} ordered items use unknown device types` : null,
              unresolved > 0 ? `${unresolved} items wait for a region (no supplying hub)` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            actions={
              unmatched > 0 ? (
                <Link to="/admin/articles" className="text-sm text-accent-text hover:underline">
                  Fix in Articles
                </Link>
              ) : undefined
            }
          >
            Their demand is not counted in the matrix.
          </Banner>
        )}
      </div>
      <div
        className={cn(
          'min-h-0 flex-1 overflow-auto border-t border-line',
          query.isPlaceholderData && 'opacity-60',
        )}
      >
        {!matrix ? (
          query.isError ? (
            <EmptyState
              icon={Boxes}
              title="The stock matrix could not be loaded"
              actions={<Button onClick={() => void query.refetch()}>Retry</Button>}
            />
          ) : (
            <SkeletonRows rows={12} widths={[80, 200, 160, 90, 120, 120, 120, 120]} />
          )
        ) : rows.length === 0 ? (
          <EmptyState icon={Filter} title="No articles match these filters">
            Remove a filter to see more articles.
          </EmptyState>
        ) : (
          <table
            className="min-w-max border-separate border-spacing-0 text-sm"
            aria-label="Stock matrix"
          >
            <thead className="sticky top-0 z-20 bg-surface">
              <tr>
                <th className="sticky left-0 z-30 border-b border-line bg-surface" />
                {sites.map((site) => (
                  <th
                    key={site.id}
                    colSpan={3}
                    className="border-b border-l border-line px-2 py-1.5 text-left"
                  >
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">{site.name}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`${site.name} options`}
                            className="ml-auto grid size-6 place-items-center rounded-xs text-fg-3 hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
                          >
                            <Icon icon={ChevronDown} size={14} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canOrder && (
                            <DropdownMenuItem
                              icon={FilePlus2}
                              onSelect={() => setOrderFor(site.id)}
                            >
                              Create call-off order…
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            icon={Filter}
                            onSelect={() => onSearchChange({ siteId: [site.id] })}
                          >
                            Show only {site.name.replace(' Hub', '')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </th>
                ))}
                <th
                  colSpan={3}
                  className="border-b border-l border-line px-2 py-1.5 text-left font-semibold"
                >
                  Totals
                </th>
              </tr>
              <tr className="text-xs text-fg-3">
                <th className="sticky left-0 z-30 h-8 w-72 min-w-72 border-b border-line bg-surface px-3 text-left font-medium">
                  Article · device type
                </th>
                {sites.map((site) => (
                  <HubSubHeader key={site.id} />
                ))}
                <th className="border-b border-l border-line px-2 text-right font-medium">Stock</th>
                <th className="border-b border-line px-2 text-right font-medium">Demand</th>
                <th className="border-b border-line px-2 text-right font-medium">Order</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const shortfall = row.cells.some((c) => c.demand > c.stock)
                return (
                  <tr
                    key={row.article.id}
                    className={cn('group', !row.article.isActive && 'text-fg-3')}
                  >
                    <td
                      className={cn(
                        'sticky left-0 z-10 w-72 max-w-72 border-r border-b border-line-subtle bg-surface px-3 py-1.5 group-hover:bg-hover',
                        shortfall && 'shadow-[inset_3px_0_0_var(--hg-tone-caution)]',
                      )}
                    >
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="hg-mono shrink-0 text-xs text-fg-3">
                          {row.article.number}
                        </span>
                        <span className="truncate font-medium" title={row.article.name}>
                          {row.article.name}
                        </span>
                      </div>
                      <div
                        className="truncate text-xs text-fg-3"
                        title={row.article.internalDescription}
                      >
                        {row.article.internalDescription} · {categoryLabel(row.article.category)}
                        {!row.article.isActive && ' · inactive'}
                      </div>
                    </td>
                    {row.cells.map((cell, colIndex) => (
                      <HubCells
                        key={cell.siteId}
                        cell={cell}
                        articleId={row.article.id}
                        articleLabel={row.article.internalDescription}
                        siteName={sites.find((s) => s.id === cell.siteId)?.name ?? ''}
                        row={rowIndex}
                        col={colIndex}
                        editable={canBuffers && row.article.isActive}
                      />
                    ))}
                    <td className="border-b border-l border-line-subtle px-2 text-right font-mono tabular-nums">
                      {row.totals.stock}
                    </td>
                    <td className="border-b border-line-subtle px-2 text-right font-mono tabular-nums">
                      {row.totals.demand}
                    </td>
                    <td
                      className={cn(
                        'border-b border-line-subtle px-2 text-right font-mono font-semibold tabular-nums',
                        row.totals.orderQty > 0 ? 'text-tone-caution-fg' : 'text-fg-3',
                      )}
                    >
                      {row.totals.orderQty}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {orderFor !== null && (
        <CreateCallOffDialog
          open
          onOpenChange={(open) => !open && setOrderFor(null)}
          siteId={orderFor}
        />
      )}
    </Page>
  )
}

function HubSubHeader() {
  return (
    <>
      <th className="w-36 min-w-36 border-b border-l border-line px-2 text-left font-medium">
        Stock · demand
      </th>
      <th className="border-b border-line px-2 text-right font-medium">Buffer</th>
      <th className="border-b border-line px-2 text-right font-medium">Order</th>
    </>
  )
}

function HubCells({
  cell,
  articleId,
  articleLabel,
  siteName,
  row,
  col,
  editable,
}: {
  cell: StockCell
  articleId: number
  articleLabel: string
  siteName: string
  row: number
  col: number
  editable: boolean
}) {
  return (
    <>
      <td className="border-b border-l border-line-subtle p-0">
        <Tooltip content={cellTooltip(cell)} side="top">
          <button
            type="button"
            aria-label={`${articleLabel} at ${siteName}: stock ${cell.stock}, demand ${cell.demand}, buffer ${cell.buffer}, order ${cell.orderQty}`}
            className="block w-full text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
          >
            <StockHeatCell cell={cell}>
              {(cell.belowMin || cell.aboveMax) && (
                <span className="flex gap-1 text-[11px] text-fg-2">
                  {cell.belowMin && (
                    <span className="inline-flex items-center gap-0.5">
                      <Icon icon={ArrowDownToLine} size={12} className="text-tone-caution" /> below
                      min {cell.minQty}
                    </span>
                  )}
                  {cell.aboveMax && (
                    <span className="inline-flex items-center gap-0.5">
                      <Icon icon={ArrowUpToLine} size={12} className="text-tone-outreach" /> above
                      max {cell.maxQty}
                    </span>
                  )}
                </span>
              )}
            </StockHeatCell>
          </button>
        </Tooltip>
      </td>
      <td className="border-b border-line-subtle px-2 text-right">
        {editable ? (
          <BufferInput
            cell={cell}
            articleId={articleId}
            row={row}
            col={col}
            label={`Buffer ${articleLabel} at ${siteName}`}
          />
        ) : (
          <span className="font-mono tabular-nums">{cell.buffer}</span>
        )}
      </td>
      <td
        className={cn(
          'border-b border-line-subtle px-2 text-right font-mono font-semibold tabular-nums',
          cell.orderQty > 0 ? 'hg-tone-caution text-(--t-fg)' : 'text-fg-3',
        )}
      >
        {cell.orderQty > 0 ? formatNumber(cell.orderQty) : '0'}
      </td>
    </>
  )
}
