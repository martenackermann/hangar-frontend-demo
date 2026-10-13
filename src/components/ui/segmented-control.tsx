import type { LucideIcon } from 'lucide-react'
import { ToggleGroup } from 'radix-ui'
import { cn } from '@/lib/utils'
import { Icon } from './icon'
import { Tooltip } from './tooltip'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
  /** Icon-only segment (label becomes the tooltip/aria-label). */
  iconOnly?: boolean
  shortcut?: string
}

/**
 * Segmented control (DESIGN.md §10): sunken track, raised selected segment, ←→ move and select.
 * 2–4 options.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: T
  onValueChange: (value: T) => void
  options: readonly SegmentOption<T>[]
  /** Accessible name of the group. */
  label: string
  className?: string
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T)
      }}
      aria-label={label}
      className={cn(
        'inline-flex h-control shrink-0 gap-0.5 rounded-sm border border-line bg-sunken p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const item = (
          <ToggleGroup.Item
            key={option.value}
            value={option.value}
            aria-label={option.iconOnly ? option.label : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xs font-medium whitespace-nowrap text-fg-3 hover:text-fg',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
              'data-[state=on]:bg-raised data-[state=on]:text-fg data-[state=on]:shadow-[0_0_0_1px_var(--hg-line),0_1px_2px_var(--hg-shadow-color)]',
              option.iconOnly ? 'px-[5px]' : 'px-2',
            )}
          >
            {option.icon && <Icon icon={option.icon} size={14} />}
            {!option.iconOnly && option.label}
          </ToggleGroup.Item>
        )
        return option.iconOnly ? (
          <Tooltip key={option.value} content={option.label} shortcut={option.shortcut}>
            {item}
          </Tooltip>
        ) : (
          item
        )
      })}
    </ToggleGroup.Root>
  )
}
