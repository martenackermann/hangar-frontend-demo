import { Check, ChevronDown } from 'lucide-react'
import { Select as RadixSelect } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Icon } from './icon'
import { floatingSurface } from './popover'

export interface SelectOption<T extends string> {
  value: T
  label: ReactNode
  /** Text for type-ahead when `label` is not a string. */
  textValue?: string
  disabled?: boolean
}

/**
 * Select (DESIGN.md §10): trigger "[prefix] value ⌄", 28 px; overlay menu with 30 px items,
 * check on the selected value, type-ahead. Radix handles Space/Enter/↓, arrows and Esc.
 */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  prefix,
  placeholder = 'Select…',
  label,
  className,
  disabled,
  id,
}: {
  value: T | undefined
  onValueChange: (value: T) => void
  options: readonly SelectOption<T>[]
  /** Muted prefix inside the trigger ("Hub"). */
  prefix?: ReactNode
  placeholder?: string
  /** Accessible name when there is no visible label. */
  label?: string
  className?: string
  disabled?: boolean
  id?: string
}) {
  return (
    <RadixSelect.Root
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      disabled={disabled}
    >
      <RadixSelect.Trigger
        id={id}
        aria-label={label}
        className={cn(
          'inline-flex h-control min-w-0 items-center gap-1.5 rounded-sm border border-line bg-surface pr-1.5 pl-2 whitespace-nowrap text-fg',
          'hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
          'disabled:text-fg-disabled data-[placeholder]:text-fg-3',
          className,
        )}
      >
        {prefix && <span className="text-fg-3">{prefix}</span>}
        <span className="min-w-0 truncate">
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon className="ml-auto">
          <Icon icon={ChevronDown} size={14} className="text-fg-3" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            floatingSurface,
            'max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)]',
          )}
        >
          <RadixSelect.Viewport>
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                textValue={option.textValue}
                disabled={option.disabled}
                className="relative flex h-[30px] cursor-default items-center rounded-xs pr-2 pl-7 outline-none select-none data-[disabled]:text-fg-disabled data-[highlighted]:bg-hover"
              >
                <RadixSelect.ItemIndicator className="absolute left-2 inline-grid size-4 place-items-center">
                  <Icon icon={Check} size={14} className="text-accent-text" />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
