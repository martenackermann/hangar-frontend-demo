import { Command } from 'cmdk'
import { Check, ChevronDown, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Icon } from './icon'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Spinner } from './spinner'

export interface ComboboxOption<T extends string | number> {
  value: T
  label: string
  /** Secondary text (e.g. "Riverton hub"). */
  hint?: string
  keywords?: string[]
}

interface CommonProps<T extends string | number> {
  options: readonly ComboboxOption<T>[]
  placeholder?: string
  searchPlaceholder?: string
  /** Accessible name of the trigger. */
  label: string
  className?: string
  disabled?: boolean
  /** Async mode: called with the typed text; the caller fetches and passes `options`. */
  onSearch?: (text: string) => void
  loading?: boolean
  /** Muted prefix inside the trigger ("Region"). */
  prefix?: ReactNode
  /** Render the list inline (inside another popover, e.g. the filter bar's "+ Filter"). */
  inline?: boolean
}

export interface ComboboxSingleProps<T extends string | number> extends CommonProps<T> {
  multiple?: false
  value: T | undefined
  onValueChange: (value: T | undefined) => void
}

export interface ComboboxMultiProps<T extends string | number> extends CommonProps<T> {
  multiple: true
  value: readonly T[]
  onValueChange: (value: T[]) => void
}

/**
 * Combobox (DESIGN.md §10): input-like trigger opening a filtered list (cmdk). Single or multi
 * (checkboxes); async results via `onSearch` + `loading`. `↑↓` move, `Enter` toggles/selects,
 * empty state names what was searched.
 */
export function Combobox<T extends string | number>(
  props: ComboboxSingleProps<T> | ComboboxMultiProps<T>,
) {
  const [open, setOpen] = useState(false)
  const selected = useMemo<readonly T[]>(
    () => (props.multiple ? props.value : props.value === undefined ? [] : [props.value]),
    [props.multiple, props.value],
  )
  const selectedLabels = props.options
    .filter((option) => selected.includes(option.value))
    .map((option) => option.label)

  const list = <ComboboxList {...props} onDone={() => setOpen(false)} />
  if (props.inline) return list

  const summary =
    selectedLabels.length === 0
      ? null
      : selectedLabels.length <= 2
        ? selectedLabels.join(', ')
        : `${selectedLabels.length} selected`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={props.disabled}
        aria-label={props.label}
        className={cn(
          'inline-flex h-control min-w-0 items-center gap-1.5 rounded-sm border border-line bg-surface pr-1.5 pl-2 text-left whitespace-nowrap',
          'hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
          'disabled:text-fg-disabled',
          props.className,
        )}
      >
        {props.prefix && <span className="text-fg-3">{props.prefix}</span>}
        <span className={cn('min-w-0 flex-1 truncate', !summary && 'text-fg-3')}>
          {summary ?? props.placeholder ?? 'Any'}
        </span>
        <Icon icon={ChevronDown} size={14} className="text-fg-3" />
      </PopoverTrigger>
      <PopoverContent className="w-[max(var(--radix-popover-trigger-width),240px)] p-0">
        {list}
      </PopoverContent>
    </Popover>
  )
}

function ComboboxList<T extends string | number>(
  props: (ComboboxSingleProps<T> | ComboboxMultiProps<T>) & { onDone: () => void },
) {
  const [text, setText] = useState('')
  const selected: readonly T[] = props.multiple
    ? props.value
    : props.value === undefined
      ? []
      : [props.value]

  const toggle = (value: T) => {
    if (props.multiple) {
      const next = props.value.includes(value)
        ? props.value.filter((v) => v !== value)
        : [...props.value, value]
      props.onValueChange(next)
    } else {
      props.onValueChange(props.value === value ? undefined : value)
      props.onDone()
    }
  }

  return (
    <Command
      shouldFilter={!props.onSearch}
      label={props.label}
      className="flex max-h-80 flex-col"
      onKeyDown={(event) => {
        // Backspace on an empty input removes the last chip (multi).
        if (event.key === 'Backspace' && text === '' && props.multiple && props.value.length) {
          props.onValueChange(props.value.slice(0, -1))
        }
      }}
    >
      <div className="flex h-9 items-center gap-2 border-b border-line px-2.5">
        <Command.Input
          value={text}
          onValueChange={(next) => {
            setText(next)
            props.onSearch?.(next)
          }}
          placeholder={props.searchPlaceholder ?? 'Filter…'}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {props.loading && <Spinner size={14} className="text-fg-3" />}
        {props.multiple && props.value.length > 0 && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-xs px-1 text-xs text-fg-3 hover:bg-hover hover:text-fg"
            onClick={() => props.onValueChange([])}
          >
            <Icon icon={X} size={12} /> Clear
          </button>
        )}
      </div>
      <Command.List className="overflow-y-auto p-1">
        <Command.Empty className="px-2 py-4 text-center text-sm text-fg-3">
          {text ? `Nothing matches “${text}”.` : 'No options.'}
        </Command.Empty>
        {props.options.map((option) => {
          const isSelected = selected.includes(option.value)
          return (
            <Command.Item
              key={String(option.value)}
              value={`${option.label} ${String(option.value)}`}
              keywords={option.keywords}
              onSelect={() => toggle(option.value)}
              className="flex h-[30px] cursor-default items-center gap-2 rounded-xs px-2 outline-none select-none data-[selected=true]:bg-hover"
            >
              {props.multiple ? (
                <span
                  aria-hidden
                  className={cn(
                    'grid size-3.5 place-items-center rounded-xs border',
                    isSelected
                      ? 'border-accent bg-accent text-fg-on-accent'
                      : 'border-line-strong bg-sunken',
                  )}
                >
                  {isSelected && <Icon icon={Check} size={12} strokeWidth={3} />}
                </span>
              ) : (
                <span className="grid size-4 place-items-center">
                  {isSelected && <Icon icon={Check} size={14} className="text-accent-text" />}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.hint && <span className="text-xs text-fg-3">{option.hint}</span>}
            </Command.Item>
          )
        })}
      </Command.List>
    </Command>
  )
}
