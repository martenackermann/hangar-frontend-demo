import { Command } from 'cmdk'
import { ChevronLeft, Plus, Rows3, Rows4, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Combobox } from '@/components/ui/combobox'
import { DateRangePicker } from '@/components/ui/date-picker'
import { Icon } from '@/components/ui/icon'
import { SearchInput } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { formatDate, formatNumber } from '@/lib/format'
import { setPrefs, usePrefs } from '@/lib/prefs/store'
import { useShortcut } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'

/**
 * FilterBar (DESIGN.md §10): SearchInput + chips "Field is value ×" + "+ Filter F" (popover →
 * field list → value editor) + result count + end controls (Columns, density). Every value
 * lives in the route's search params (comma lists), so a filtered view is a link.
 */
export interface FilterOption {
  value: string
  label: string
}

export type FilterDef =
  | { kind: 'multi'; key: string; label: string; options: readonly FilterOption[] }
  | { kind: 'single'; key: string; label: string; options: readonly FilterOption[] }
  | { kind: 'boolean'; key: string; label: string; trueLabel?: string; falseLabel?: string }
  | { kind: 'dateRange'; id: string; label: string; fromKey: string; toKey: string }

export type SearchPatch = Record<string, unknown>

function defId(def: FilterDef): string {
  return def.kind === 'dateRange' ? def.id : def.key
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string' && value) return value.split(',')
  if (typeof value === 'number') return [String(value)]
  return []
}

function isActive(def: FilterDef, search: Record<string, unknown>): boolean {
  if (def.kind === 'dateRange') return Boolean(search[def.fromKey] ?? search[def.toKey])
  const value = search[def.key]
  return (
    value !== undefined &&
    value !== null &&
    value !== '' &&
    !(Array.isArray(value) && value.length === 0)
  )
}

function chipValue(def: FilterDef, search: Record<string, unknown>): string {
  switch (def.kind) {
    case 'multi': {
      const labels = asList(search[def.key]).map(
        (v) => def.options.find((o) => o.value === v)?.label ?? v,
      )
      return labels.length <= 2
        ? labels.join(', ')
        : `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`
    }
    case 'single': {
      const value = String(search[def.key])
      return def.options.find((o) => o.value === value)?.label ?? value
    }
    case 'boolean':
      return search[def.key] === true || search[def.key] === 'true'
        ? (def.trueLabel ?? 'Yes')
        : (def.falseLabel ?? 'No')
    case 'dateRange': {
      const from = search[def.fromKey] as string | undefined
      const to = search[def.toKey] as string | undefined
      if (from && to)
        return from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`
      return from ? `from ${formatDate(from)}` : `until ${formatDate(to)}`
    }
  }
}

function clearPatch(def: FilterDef): SearchPatch {
  return def.kind === 'dateRange'
    ? { [def.fromKey]: undefined, [def.toKey]: undefined }
    : { [def.key]: undefined }
}

function FilterEditor({
  def,
  search,
  onChange,
  onDone,
}: {
  def: FilterDef
  search: Record<string, unknown>
  onChange: (patch: SearchPatch) => void
  onDone: () => void
}) {
  switch (def.kind) {
    case 'multi':
      return (
        <Combobox
          inline
          multiple
          label={def.label}
          options={def.options}
          value={asList(search[def.key])}
          onValueChange={(values) => onChange({ [def.key]: values.length ? values : undefined })}
          searchPlaceholder={`Filter ${def.label.toLowerCase()}…`}
        />
      )
    case 'single':
      return (
        <Combobox
          inline
          label={def.label}
          options={def.options}
          value={search[def.key] === undefined ? undefined : String(search[def.key])}
          onValueChange={(value) => {
            onChange({ [def.key]: value })
            onDone()
          }}
        />
      )
    case 'boolean':
      return (
        <div className="grid p-1" role="group" aria-label={def.label}>
          {[true, false].map((value) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => {
                onChange({ [def.key]: value })
                onDone()
              }}
              className="flex h-[30px] items-center rounded-xs px-2 text-left hover:bg-hover"
            >
              {value ? (def.trueLabel ?? 'Yes') : (def.falseLabel ?? 'No')}
            </button>
          ))}
        </div>
      )
    case 'dateRange':
      return (
        <DateRangePicker
          inline
          label={def.label}
          value={{
            from: search[def.fromKey] as string | undefined,
            to: search[def.toKey] as string | undefined,
          }}
          onChange={(range) => onChange({ [def.fromKey]: range.from, [def.toKey]: range.to })}
        />
      )
  }
}

function FilterChip({
  def,
  search,
  onChange,
}: {
  def: FilterDef
  search: Record<string, unknown>
  onChange: (patch: SearchPatch) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-xs border border-line bg-surface pl-2 text-xs whitespace-nowrap">
        <PopoverTrigger className="inline-flex items-center gap-1 rounded-2xs focus-visible:outline-2 focus-visible:outline-focus">
          <span className="text-fg-3">
            {def.label} {def.kind === 'dateRange' ? '' : 'is'}
          </span>
          <span className="font-medium text-fg">{chipValue(def, search)}</span>
        </PopoverTrigger>
        <button
          type="button"
          aria-label={`Remove filter ${def.label}`}
          onClick={() => onChange(clearPatch(def))}
          className="grid size-5 place-items-center rounded-2xs text-fg-3 hover:bg-hover hover:text-fg"
        >
          <Icon icon={X} size={12} />
        </button>
      </span>
      <PopoverContent className="w-72 p-0">
        <FilterEditor def={def} search={search} onChange={onChange} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

function AddFilter({
  filters,
  search,
  onChange,
}: {
  filters: readonly FilterDef[]
  search: Record<string, unknown>
  onChange: (patch: SearchPatch) => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FilterDef | null>(null)
  useShortcut('f', () => setOpen(true), { description: 'Add filter', group: 'Lists' })
  const available = filters.filter((def) => !isActive(def, search))
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setEditing(null)
      }}
    >
      <PopoverTrigger className="inline-flex h-6 shrink-0 items-center gap-1 rounded-xs border border-dashed border-line pr-2 pl-1.5 text-xs text-fg-2 hover:border-solid hover:text-fg focus-visible:outline-2 focus-visible:outline-focus">
        <Icon icon={Plus} size={12} /> Filter <Kbd>F</Kbd>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
        {editing ? (
          <div>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="flex h-8 w-full items-center gap-1 border-b border-line px-2 text-xs text-fg-3 hover:text-fg"
            >
              <Icon icon={ChevronLeft} size={14} /> {editing.label}
            </button>
            <FilterEditor
              def={editing}
              search={search}
              onChange={onChange}
              onDone={() => setOpen(false)}
            />
          </div>
        ) : (
          <Command label="Filter by">
            <Command.Input
              placeholder="Filter by…"
              className="h-9 w-full border-b border-line bg-transparent px-2.5 text-sm outline-none"
            />
            <Command.List className="max-h-72 overflow-y-auto p-1">
              <Command.Empty className="px-2 py-4 text-center text-sm text-fg-3">
                No more filters.
              </Command.Empty>
              {available.map((def) => (
                <Command.Item
                  key={defId(def)}
                  value={def.label}
                  onSelect={() => setEditing(def)}
                  className="flex h-[30px] cursor-default items-center rounded-xs px-2 data-[selected=true]:bg-hover"
                >
                  {def.label}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}

export interface FilterBarProps {
  search: Record<string, unknown>
  /** Merge into the route search (the FilterBar always resets `page`). */
  onSearchChange: (patch: SearchPatch) => void
  filters: readonly FilterDef[]
  /** Free-text `q` param; omit to hide the search box. */
  searchPlaceholder?: string
  /** "318 of 1,284" */
  resultCount?: number
  totalCount?: number
  /** End controls: `<ColumnChooser>`, `<DensityToggle>`. */
  end?: ReactNode
  className?: string
}

export function FilterBar({
  search,
  onSearchChange,
  filters,
  searchPlaceholder,
  resultCount,
  totalCount,
  end,
  className,
}: FilterBarProps) {
  const change = (patch: SearchPatch) =>
    onSearchChange({ ...patch, page: undefined, view: search.view })
  const q = typeof search.q === 'string' ? search.q : ''
  const [text, setText] = useState(q)
  const [syncedQ, setSyncedQ] = useState(q)
  if (q !== syncedQ) {
    setSyncedQ(q)
    setText(q)
  }
  const changeRef = useRef(change)
  useEffect(() => {
    changeRef.current = change
  })
  useEffect(() => {
    if (text === q) return
    const timer = window.setTimeout(() => changeRef.current({ q: text || undefined }), 250)
    return () => window.clearTimeout(timer)
  }, [text, q])

  const active = filters.filter((def) => isActive(def, search))

  return (
    <div
      className={cn(
        'sticky top-0 z-10 flex min-w-0 items-center gap-2 border-y border-line bg-surface px-4 py-2 max-md:flex-wrap max-md:px-3',
        className,
      )}
    >
      {searchPlaceholder !== undefined && (
        <SearchInput
          value={text}
          onValueChange={setText}
          placeholder={searchPlaceholder}
          slashShortcut
          aria-label="Search"
          frameClassName="w-60 shrink-0 max-md:w-full"
        />
      )}
      <div className="hg-no-scrollbar flex min-w-0 items-center gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)] pr-6 max-md:flex-1">
        {active.map((def) => (
          <FilterChip key={defId(def)} def={def} search={search} onChange={change} />
        ))}
        <AddFilter filters={filters} search={search} onChange={change} />
        {active.length > 1 && (
          <button
            type="button"
            onClick={() => change(Object.assign({}, ...active.map(clearPatch)) as SearchPatch)}
            className="shrink-0 text-xs text-fg-3 hover:text-fg"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2 max-md:hidden">
        {resultCount !== undefined && (
          <span className="text-xs whitespace-nowrap text-fg-3" aria-live="polite">
            <b className="font-semibold text-fg">{formatNumber(resultCount)}</b>
            {totalCount !== undefined ? ` of ${formatNumber(totalCount)}` : ' results'}
          </span>
        )}
        {end}
      </div>
    </div>
  )
}

/** Density toggle (DESIGN.md §5): compact / comfortable, also `D` globally. */
export function DensityToggle() {
  const density = usePrefs((prefs) => prefs.density)
  return (
    <SegmentedControl
      label="Row density"
      value={density}
      onValueChange={(value) => setPrefs({ density: value })}
      options={[
        { value: 'compact', label: 'Compact rows', icon: Rows4, iconOnly: true, shortcut: 'd' },
        {
          value: 'comfortable',
          label: 'Comfortable rows',
          icon: Rows3,
          iconOnly: true,
          shortcut: 'd',
        },
      ]}
    />
  )
}
