import {
  columnOrderingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  tableFeatures,
  useTable,
  type RowData,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, RefreshCw, SearchX } from 'lucide-react'
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Button, IconButton } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState, SkeletonRows } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { isApiError } from '@/lib/api/errors'
import { formatNumber } from '@/lib/format'
import { usePrefs } from '@/lib/prefs/store'
import { formatSort, parseSort, PER_PAGE_OPTIONS } from '@/lib/search/params'
import { useShortcut } from '@/lib/shortcuts'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import type { ColumnPrefs } from './column-prefs'

/**
 * DataTable (DESIGN.md §10, SCREENS.md §0 "Tables") on TanStack Table v9 + TanStack Virtual.
 *
 * - Columns are plain descriptors (`DataColumn<T>`); the table maps them onto TanStack Table's
 *   column model (visibility, order, sizing). Visibility/order come from `useTableColumns`
 *   (persisted per user) and are edited with `<ColumnChooser>`.
 * - Server-side sort (`sort` = API spec `-field,field2`) and pagination (`page`/`perPage`, API
 *   `Page<T>` envelope) are controlled by the route's search params.
 * - Rows are virtualized (overscan 10); `aria-rowcount` = total, `aria-rowindex` per row.
 * - Keyboard (when focus is not in an input): `j`/`k` or `↓`/`↑` move the cursor, `x` toggles
 *   selection, `Shift+x` selects all on the page, `Enter`/`o` opens, `Esc` clears the selection,
 *   `[`/`]` previous/next page. With a drawer open (`activeId`), moving the cursor moves the drawer.
 * - First load shows skeleton rows; refetches keep the previous rows at 60 % with a 2 px amber
 *   progress line (no skeleton flashes).
 */
export interface DataColumn<T> {
  id: string
  header: string
  cell: (row: T) => ReactNode
  /** API sort field (sortable when set). */
  sortField?: string
  /** Width in px (default 140). */
  width?: number
  align?: 'start' | 'end'
  /** Hidden until enabled in the column chooser. */
  defaultHidden?: boolean
  /** Cannot be hidden or moved (identifier column). */
  locked?: boolean
  /** Sticky at the left edge (identifier column; DESIGN: select + identifier sticky). */
  pinned?: boolean
  /** Full value tooltip for truncated text. */
  title?: (row: T) => string | null | undefined
  className?: string
}

export interface PaginationProps {
  page: number
  perPage: number
  total: number
  onPageChange: (page: number) => void
  onPerPageChange?: (perPage: number) => void
}

export interface DataTableProps<T extends RowData> {
  /** Accessible name ("Service requests"). */
  label: string
  columns: readonly DataColumn<T>[]
  columnPrefs?: ColumnPrefs
  rows: readonly T[]
  getRowId: (row: T) => string
  /** Total rows matching the filters (API `meta.total`). */
  total?: number
  /** First load (no data yet): skeleton rows. */
  loading?: boolean
  /** Background refetch: previous rows at 60 % + progress line. */
  fetching?: boolean
  error?: unknown
  onRetry?: () => void
  sort?: string | undefined
  onSortChange?: (sort: string | undefined) => void
  /** Show the checkbox column (screens with bulk actions). */
  selectable?: boolean
  selectedIds?: readonly string[]
  onSelectedIdsChange?: (ids: string[]) => void
  /** Row currently open in the drawer (cursor style). */
  activeId?: string | null
  onOpen?: (row: T) => void
  pagination?: PaginationProps
  /** Rendered when there are no rows (filtered or first-run). */
  empty?: ReactNode
  /** Two-line record for phones (< 768 px); default = the first columns stacked. */
  mobileRow?: (row: T) => ReactNode
  /** Register list keyboard shortcuts (one table per screen). Default true. */
  keyboard?: boolean
  className?: string
}

const features = tableFeatures({
  columnVisibilityFeature,
  columnOrderingFeature,
  columnSizingFeature,
})
const SELECT_COLUMN_WIDTH = 36

export function DataTable<T extends RowData>({
  label,
  columns,
  columnPrefs,
  rows,
  getRowId,
  total,
  loading,
  fetching,
  error,
  onRetry,
  sort,
  onSortChange,
  selectable,
  selectedIds = EMPTY_IDS,
  onSelectedIdsChange,
  activeId,
  onOpen,
  pagination,
  empty,
  mobileRow,
  keyboard = true,
  className,
}: DataTableProps<T>) {
  const isPhone = useMediaQuery('(max-width: 767px)')
  const coarse = useMediaQuery('(pointer: coarse)')
  const density = usePrefs((prefs) => prefs.density)
  const rowHeight = density === 'comfortable' || coarse ? 40 : 32

  // ---- TanStack Table column model -------------------------------------------------------
  const helper = useMemo(() => createColumnHelper<typeof features, T>(), [])
  const tableColumns = useMemo(
    () =>
      columns.map((column) =>
        helper.display({
          id: column.id,
          header: column.header,
          size: column.width ?? 140,
        }),
      ),
    [columns, helper],
  )
  const columnVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {}
    for (const id of columnPrefs?.hidden ?? []) visibility[id] = false
    return visibility
  }, [columnPrefs?.hidden])
  const columnOrder = useMemo(() => {
    const order = columnPrefs?.order ?? columns.map((c) => c.id)
    // Pinned columns always lead, in definition order.
    const pinned = columns.filter((c) => c.pinned).map((c) => c.id)
    return [...pinned, ...order.filter((id) => !pinned.includes(id))]
  }, [columnPrefs?.order, columns])
  const data = rows as T[]
  const table = useTable({
    features,
    columns: tableColumns,
    data,
    getRowId: (row) => getRowId(row),
    state: { columnVisibility, columnOrder },
  })
  const byId = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns])
  const visibleColumns = useMemo(
    () =>
      table
        .getVisibleLeafColumns()
        .map((column) => byId.get(column.id))
        .filter((column): column is DataColumn<T> => column !== undefined),
    // the table reads visibility and order from these props
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, byId, columnVisibility, columnOrder],
  )

  // Sticky offsets for pinned columns.
  const stickyLeft = useMemo(() => {
    const offsets = new Map<string, number>()
    let offset = selectable ? SELECT_COLUMN_WIDTH : 0
    for (const column of visibleColumns) {
      if (!column.pinned) break
      offsets.set(column.id, offset)
      offset += column.width ?? 140
    }
    return offsets
  }, [selectable, visibleColumns])
  const lastPinnedId = [...stickyLeft.keys()].at(-1)

  // ---- selection & cursor ------------------------------------------------------------------
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const ids = useMemo(() => rows.map((row) => getRowId(row)), [rows, getRowId])
  const [cursorId, setCursorId] = useState<string | null>(null)
  // remember the last record the drawer showed: closing it leaves the cursor (and tab stop) there
  const [lastActive, setLastActive] = useState(activeId)
  if (activeId && activeId !== lastActive) {
    setLastActive(activeId)
    setCursorId(activeId)
  }
  const cursor = activeId ?? cursorId
  const cursorIndex = cursor ? ids.indexOf(cursor) : -1
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id))
  const someSelected = !allSelected && ids.some((id) => selected.has(id))

  const toggle = useCallback(
    (id: string) => {
      if (!onSelectedIdsChange) return
      const next = new Set(selected)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      onSelectedIdsChange([...next])
    },
    [onSelectedIdsChange, selected],
  )
  const toggleAll = useCallback(() => {
    if (!onSelectedIdsChange) return
    if (allSelected) onSelectedIdsChange([...selected].filter((id) => !ids.includes(id)))
    else onSelectedIdsChange([...new Set([...selected, ...ids])])
  }, [allSelected, ids, onSelectedIdsChange, selected])

  // ---- virtualization ------------------------------------------------------------------------
  const scrollRef = useRef<HTMLDivElement>(null)
  // TanStack Virtual returns fresh functions each render, so React Compiler skips this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
    getItemKey: (index) => ids[index] ?? index,
  })

  // Keyboard focus follows the cursor while it is inside the table (roving tabindex on the
  // row-open controls), so j/k and the arrow keys move real focus, not just the highlight.
  const focusCursor = useRef<string | null>(null)
  const moveCursor = useCallback(
    (delta: number, fromIndex = cursorIndex) => {
      if (ids.length === 0) return
      const nextIndex = Math.max(0, Math.min(ids.length - 1, fromIndex < 0 ? 0 : fromIndex + delta))
      const id = ids[nextIndex]
      const row = rows[nextIndex]
      if (id === undefined || row === undefined) return
      focusCursor.current = scrollRef.current?.contains(document.activeElement) ? id : null
      setCursorId(id)
      virtualizer.scrollToIndex(nextIndex, { align: 'auto' })
      if (activeId) onOpen?.(row)
    },
    [activeId, cursorIndex, ids, onOpen, rows, virtualizer],
  )
  useEffect(() => {
    // wait until the cursor really is the target (with a drawer open it follows the URL)
    if (!cursor || focusCursor.current !== cursor) return
    focusCursor.current = null
    const focus = () =>
      [...(scrollRef.current?.querySelectorAll<HTMLElement>('[data-row-open]') ?? [])]
        .find((control) => control.dataset.rowOpen === cursor)
        ?.focus({ preventScroll: true })
    // the virtualizer may render the row on the next frame
    requestAnimationFrame(focus)
  }, [cursor])

  // The drawer moved to another record (J/K, prev/next): if focus is on a row, follow it.
  useEffect(() => {
    if (!activeId) return
    const focused = document.activeElement
    if (
      focused instanceof HTMLElement &&
      focused.dataset.rowOpen &&
      focused.dataset.rowOpen !== activeId &&
      scrollRef.current?.contains(focused)
    ) {
      focusCursor.current = activeId
      requestAnimationFrame(() =>
        [...(scrollRef.current?.querySelectorAll<HTMLElement>('[data-row-open]') ?? [])]
          .find((control) => control.dataset.rowOpen === activeId)
          ?.focus({ preventScroll: true }),
      )
    }
  }, [activeId])

  // Arrow keys on a focused row work even with single-key shortcuts switched off (WCAG 2.1.4
  // allows keys that only act while the component has focus).
  const onRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const target = event.target as HTMLElement
      if (!target.matches('[data-row-open]')) return
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      // move from the focused row (Tab may have put focus somewhere other than the cursor)
      moveCursor(event.key === 'ArrowDown' ? 1 : -1, ids.indexOf(target.dataset.rowOpen ?? ''))
    },
    [ids, moveCursor],
  )

  // Stable callbacks for the memoized rows.
  const latest = useRef({ toggle, onOpen })
  useEffect(() => {
    latest.current = { toggle, onOpen }
  })
  const onRowToggle = useCallback((id: string) => latest.current.toggle(id), [])
  const onRowOpen = useCallback((id: string, row: T) => {
    setCursorId(id)
    latest.current.onOpen?.(row)
  }, [])
  const tableId = useId()

  const kb = keyboard && !isPhone
  useShortcut(['j', 'arrowdown'], () => moveCursor(1), {
    enabled: kb,
    description: 'Next row',
    group: 'Lists',
  })
  useShortcut(['k', 'arrowup'], () => moveCursor(-1), {
    enabled: kb,
    description: 'Previous row',
    group: 'Lists',
  })
  useShortcut(
    ['enter', 'o'],
    () => {
      const row = cursorIndex >= 0 ? rows[cursorIndex] : undefined
      if (row) onOpen?.(row)
    },
    { enabled: kb && Boolean(onOpen), description: 'Open focused row', group: 'Lists' },
  )
  useShortcut('x', () => cursor && toggle(cursor), {
    enabled: kb && Boolean(selectable),
    description: 'Toggle selection',
    group: 'Lists',
  })
  useShortcut('shift+x', toggleAll, {
    enabled: kb && Boolean(selectable),
    description: 'Select all on page',
    group: 'Lists',
  })
  useShortcut('escape', () => onSelectedIdsChange?.([]), {
    enabled: kb && selected.size > 0 && !activeId,
    description: 'Clear selection',
    group: 'Lists',
  })
  const pageCount = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.perPage)) : 1
  useShortcut(
    '[',
    () => pagination && pagination.page > 1 && pagination.onPageChange(pagination.page - 1),
    {
      enabled: kb && Boolean(pagination),
      description: 'Previous page',
      group: 'Lists',
    },
  )
  useShortcut(
    ']',
    () => pagination && pagination.page < pageCount && pagination.onPageChange(pagination.page + 1),
    {
      enabled: kb && Boolean(pagination),
      description: 'Next page',
      group: 'Lists',
    },
  )

  // ---- sorting -----------------------------------------------------------------------------
  const sortFields = parseSort(sort)
  const primarySort = sortFields[0]
  const onHeaderSort = (column: DataColumn<T>) => {
    if (!column.sortField || !onSortChange) return
    const field = column.sortField
    const current = primarySort?.field === field ? primarySort.direction : null
    const next = current === null ? 'asc' : current === 'asc' ? 'desc' : null
    onSortChange(next ? formatSort([{ field, direction: next }]) : undefined)
  }

  const rowOffset = pagination ? (pagination.page - 1) * pagination.perPage : 0
  const totalRows = total ?? pagination?.total ?? rows.length

  // ---- states --------------------------------------------------------------------------------
  if (error && rows.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title={isApiError(error) ? error.title : 'This list could not be loaded'}
        actions={
          onRetry && (
            <Button icon={RefreshCw} onClick={onRetry}>
              Retry
            </Button>
          )
        }
      >
        {isApiError(error) ? error.detail : 'Check your connection and try again.'}
      </EmptyState>
    )
  }

  const progressLine = fetching && !loading && (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden"
    >
      <div className="h-full w-1/3 animate-[hg-shimmer_1.2s_linear_infinite] bg-accent" />
    </div>
  )

  if (isPhone) {
    const mobileContent = (row: T) =>
      mobileRow
        ? mobileRow(row)
        : visibleColumns.slice(0, 3).map((column) => (
            <span key={column.id} className="min-w-0 truncate">
              {column.cell(row)}
            </span>
          ))
    return (
      <div className={cn('relative min-h-0 overflow-auto bg-surface', className)}>
        {progressLine}
        {loading ? (
          <SkeletonRows rows={6} widths={[90, 160]} />
        ) : rows.length === 0 ? (
          empty
        ) : (
          <ul aria-label={label} className={cn(fetching && 'opacity-60 transition-opacity')}>
            {rows.map((row, index) => {
              const id = ids[index] ?? String(index)
              const isSelected = selected.has(id)
              return (
                <li
                  key={id}
                  className={cn(
                    'grid grid-cols-[auto_1fr] items-start gap-3 border-b border-line-subtle px-3 py-2.5',
                    isSelected && 'bg-accent-wash',
                    id === cursor && 'bg-accent-wash-strong',
                  )}
                >
                  {selectable ? (
                    <Checkbox
                      large
                      checked={isSelected}
                      onCheckedChange={() => toggle(id)}
                      aria-label={`Select row ${index + 1}`}
                      className="mt-0.5"
                    />
                  ) : (
                    <span />
                  )}
                  {onOpen ? (
                    <button
                      type="button"
                      className="grid min-w-0 gap-0.5 text-left"
                      onClick={() => onOpen(row)}
                    >
                      {mobileContent(row)}
                    </button>
                  ) : (
                    // Not openable: cells may hold their own controls (no button around them).
                    <div className="grid min-w-0 gap-0.5">{mobileContent(row)}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {pagination && <PaginationFooter {...pagination} />}
      </div>
    )
  }

  const virtualItems = virtualizer.getVirtualItems()
  const paddingTop = virtualItems[0]?.start ?? 0
  const paddingBottom = virtualizer.getTotalSize() - (virtualItems.at(-1)?.end ?? 0)
  const colSpan = visibleColumns.length + (selectable ? 1 : 0)

  return (
    <div className={cn('relative flex min-h-0 flex-col bg-surface', className)}>
      {progressLine}
      {/* arrow keys bubble up from the focused row control */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" onKeyDown={onRowKeyDown}>
        <span id={`${tableId}-select`} hidden>
          Select
        </span>
        <table
          aria-label={label}
          aria-rowcount={totalRows + 1}
          aria-busy={loading || fetching || undefined}
          className={cn(
            'w-max min-w-full table-fixed border-separate border-spacing-0 text-table',
            fetching && !loading && '[&_tbody]:opacity-60 [&_tbody]:transition-opacity',
          )}
        >
          <colgroup>
            {selectable && <col style={{ width: SELECT_COLUMN_WIDTH }} />}
            {visibleColumns.map((column) => (
              <col key={column.id} style={{ width: column.width ?? 140 }} />
            ))}
          </colgroup>
          <thead>
            <tr aria-rowindex={1}>
              {selectable && (
                <th
                  scope="col"
                  className="sticky top-0 left-0 z-[3] h-8 border-b border-line bg-surface pl-3"
                >
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                    aria-label="Select all rows on this page"
                  />
                </th>
              )}
              {visibleColumns.map((column) => {
                const sorted =
                  column.sortField && primarySort?.field === column.sortField
                    ? primarySort.direction
                    : null
                const left = stickyLeft.get(column.id)
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined}
                    style={left !== undefined ? { left } : undefined}
                    className={cn(
                      'sticky top-0 z-[2] h-8 border-b border-line bg-surface px-cell text-left text-xs font-medium whitespace-nowrap [font-stretch:87.5%]',
                      sorted ? 'text-fg' : 'text-fg-3',
                      left !== undefined && 'z-[3]',
                      column.id === lastPinnedId && 'shadow-[inset_-1px_0_0_var(--hg-line-subtle)]',
                      column.align === 'end' && 'text-right',
                    )}
                  >
                    {column.sortField && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => onHeaderSort(column)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-2xs hover:text-fg focus-visible:outline-2 focus-visible:outline-focus',
                          column.align === 'end' && 'flex-row-reverse',
                        )}
                      >
                        {column.header}
                        {sorted && (
                          <Icon
                            icon={sorted === 'asc' ? ArrowUp : ArrowDown}
                            size={12}
                            className="text-accent-text"
                          />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="p-0">
                  <SkeletonRows
                    rows={10}
                    widths={visibleColumns
                      .slice(0, 6)
                      .map((c) => Math.round((c.width ?? 140) * 0.6))}
                  />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="p-0">
                  {empty}
                </td>
              </tr>
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden>
                    <td colSpan={colSpan} style={{ height: paddingTop }} className="p-0" />
                  </tr>
                )}
                {virtualItems.map((item) => {
                  const row = rows[item.index]
                  const id = ids[item.index]
                  if (row === undefined || id === undefined) return null
                  return (
                    <DataTableRow<T>
                      key={id}
                      row={row}
                      id={id}
                      rowIndex={rowOffset + item.index + 2}
                      tableId={tableId}
                      columns={visibleColumns}
                      stickyLeft={stickyLeft}
                      lastPinnedId={lastPinnedId}
                      selectable={Boolean(selectable)}
                      selected={selected.has(id)}
                      isCursor={id === cursor}
                      tabbable={cursor ? id === cursor : item.index === 0}
                      openable={Boolean(onOpen)}
                      onToggle={onRowToggle}
                      onOpen={onRowOpen}
                    />
                  )
                })}
                {paddingBottom > 0 && (
                  <tr aria-hidden>
                    <td colSpan={colSpan} style={{ height: paddingBottom }} className="p-0" />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
      {pagination && <PaginationFooter {...pagination} />}
    </div>
  )
}

interface DataTableRowProps<T> {
  row: T
  id: string
  rowIndex: number
  tableId: string
  columns: readonly DataColumn<T>[]
  stickyLeft: ReadonlyMap<string, number>
  lastPinnedId: string | undefined
  selectable: boolean
  selected: boolean
  isCursor: boolean
  /** The row's open control is the table's single tab stop (roving tabindex). */
  tabbable: boolean
  openable: boolean
  onToggle: (id: string) => void
  onOpen: (id: string, row: T) => void
}

/**
 * One desktop row, memoized: moving the cursor or toggling a row re-renders two rows, not the
 * page. The first cell carries a real button (named by the cell's text), so every record can be
 * reached and opened with Tab and Enter; the row itself stays clickable.
 */
const DataTableRow = memo(function DataTableRow<T>({
  row,
  id,
  rowIndex,
  tableId,
  columns,
  stickyLeft,
  lastPinnedId,
  selectable,
  selected,
  isCursor,
  tabbable,
  openable,
  onToggle,
  onOpen,
}: DataTableRowProps<T>) {
  const firstCellId = `${tableId}-${id}`
  return (
    <tr
      aria-rowindex={rowIndex}
      data-cursor={isCursor || undefined}
      onClick={(event) => {
        const target = event.target as HTMLElement
        // React bubbles clicks from portals (menus, dialogs opened from a cell) through the row:
        // only clicks inside the row's DOM open it.
        if (!event.currentTarget.contains(target)) return
        if (target.closest('button, a, input, [role="checkbox"]')) return
        if (openable) onOpen(id, row)
      }}
      className={cn(
        'group/row',
        openable && 'cursor-pointer',
        '[&>td]:h-row [&>td]:border-b [&>td]:border-line-subtle [&>td]:bg-surface hover:[&>td]:bg-hover',
        selected && '[&>td]:bg-accent-wash hover:[&>td]:bg-accent-wash',
        isCursor &&
          '[&>td]:bg-accent-wash-strong [&>td]:shadow-[inset_0_1px_0_var(--hg-accent-line),inset_0_-1px_0_var(--hg-accent-line)] hover:[&>td]:bg-accent-wash-strong [&>td:first-child]:shadow-[inset_0_1px_0_var(--hg-accent-line),inset_0_-1px_0_var(--hg-accent-line),inset_1px_0_0_var(--hg-accent-line)] [&>td:last-child]:shadow-[inset_0_1px_0_var(--hg-accent-line),inset_0_-1px_0_var(--hg-accent-line),inset_-1px_0_0_var(--hg-accent-line)]',
      )}
    >
      {selectable && (
        <td className="sticky left-0 z-[1] pl-3" onClick={() => onToggle(id)}>
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggle(id)}
            aria-labelledby={`${tableId}-select ${firstCellId}`}
          />
        </td>
      )}
      {columns.map((column, index) => {
        const left = stickyLeft.get(column.id)
        const title = column.title?.(row) ?? undefined
        const first = index === 0
        return (
          <td
            key={column.id}
            title={title}
            style={left !== undefined ? { left } : undefined}
            className={cn(
              'overflow-hidden px-cell text-ellipsis whitespace-nowrap',
              left !== undefined ? 'sticky z-[1]' : first && openable && 'relative',
              column.id === lastPinnedId && 'shadow-[inset_-1px_0_0_var(--hg-line-subtle)]',
              column.align === 'end' && 'text-right',
              column.className,
            )}
          >
            {first && openable ? (
              <>
                <button
                  type="button"
                  data-row-open={id}
                  tabIndex={tabbable ? 0 : -1}
                  aria-labelledby={firstCellId}
                  aria-current={isCursor || undefined}
                  onClick={() => onOpen(id, row)}
                  className="absolute inset-0 cursor-pointer rounded-xs focus-visible:outline-offset-[-2px]"
                />
                {/* content above the open control; its own links and buttons stay clickable */}
                <span
                  id={firstCellId}
                  className="pointer-events-none relative block overflow-hidden text-ellipsis [&_a]:pointer-events-auto [&_button]:pointer-events-auto"
                >
                  {column.cell(row)}
                </span>
              </>
            ) : first ? (
              <span id={firstCellId}>{column.cell(row)}</span>
            ) : (
              column.cell(row)
            )}
          </td>
        )
      })}
    </tr>
  )
}) as <T>(props: DataTableRowProps<T>) => ReactNode

const EMPTY_IDS: readonly string[] = []

/** Compact pager: "26–50 of 318 · ‹ › · 25 per page" (SCREENS.md: page/perPage in the URL). */
export function PaginationFooter({
  page,
  perPage,
  total,
  onPageChange,
  onPerPageChange,
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / perPage))
  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(total, page * perPage)
  return (
    <div className="flex items-center justify-end gap-3 border-t border-line bg-surface px-3 py-1.5 text-xs text-fg-3">
      <span aria-live="polite">
        {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
      </span>
      <div className="flex items-center gap-1">
        <IconButton
          icon={ChevronLeft}
          label="Previous page"
          shortcut="["
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        />
        <span className="font-mono">
          {page} / {pageCount}
        </span>
        <IconButton
          icon={ChevronRight}
          label="Next page"
          shortcut="]"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
      {onPerPageChange && (
        <Select
          label="Rows per page"
          value={String(perPage)}
          onValueChange={(value) => onPerPageChange(Number(value))}
          options={PER_PAGE_OPTIONS.map((n) => ({ value: String(n), label: `${n} per page` }))}
          className="h-6 text-xs"
        />
      )}
    </div>
  )
}
