import type { LucideIcon } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
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
 * Segmented control (DESIGN.md §10): sunken track, raised selected segment. 2–4 options.
 * A radio group (Radix RadioGroup, roving focus): Tab enters on the selected segment and
 * `←→` move *and* select, as DESIGN.md specifies. Segments grow to ≥ 40 px on touch devices.
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
    <RadioGroup.Root
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T)
      }}
      orientation="horizontal"
      aria-label={label}
      className={cn(
        'inline-flex h-control shrink-0 gap-0.5 rounded-sm border border-line bg-sunken p-0.5',
        'pointer-coarse:h-auto',
        className,
      )}
    >
      {options.map((option) => {
        const item = (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            aria-label={option.iconOnly ? option.label : undefined}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-xs font-medium whitespace-nowrap text-fg-3 hover:text-fg',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
              'data-[state=checked]:bg-raised data-[state=checked]:text-fg data-[state=checked]:shadow-[0_0_0_1px_var(--hg-line),0_1px_2px_var(--hg-shadow-color)]',
              'pointer-coarse:min-h-10',
              option.iconOnly ? 'px-[5px] pointer-coarse:min-w-10' : 'px-2',
            )}
          >
            {option.icon && <Icon icon={option.icon} size={14} />}
            {!option.iconOnly && option.label}
          </RadioGroup.Item>
        )
        return option.iconOnly ? (
          <Tooltip key={option.value} content={option.label} shortcut={option.shortcut}>
            {item}
          </Tooltip>
        ) : (
          item
        )
      })}
    </RadioGroup.Root>
  )
}
