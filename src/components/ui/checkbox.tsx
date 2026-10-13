import { Check, Minus } from 'lucide-react'
import { Checkbox as RadixCheckbox, Switch as RadixSwitch } from 'radix-ui'
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Icon } from './icon'

export interface CheckboxProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixCheckbox.Root>,
  'checked' | 'onCheckedChange'
> {
  checked: boolean | 'indeterminate'
  onCheckedChange: (checked: boolean) => void
  /** Touch size (18 px). */
  large?: boolean
}

/**
 * 14 px (18 touch), radius 3, amber when checked, dash for "some rows" (DESIGN.md §10). The
 * checked box keeps a ≥3:1 boundary in light mode (`accent-line` border around the amber).
 */
export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { checked, onCheckedChange, large, className, ...props },
  ref,
) {
  return (
    <RadixCheckbox.Root
      ref={ref}
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      className={cn(
        'hg-focus-on-accent inline-grid shrink-0 place-items-center rounded-xs border border-line-strong bg-sunken transition-colors duration-[var(--hg-dur-instant)]',
        'data-[state=checked]:border-accent-line data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent-line data-[state=indeterminate]:bg-accent',
        'disabled:border-line disabled:bg-transparent',
        large ? 'size-[18px]' : 'size-3.5 pointer-coarse:size-[18px]',
        className,
      )}
      {...props}
    >
      <RadixCheckbox.Indicator className="text-fg-on-accent">
        <Icon icon={checked === 'indeterminate' ? Minus : Check} size={12} strokeWidth={3} />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  )
})

export interface SwitchProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixSwitch.Root>,
  'checked' | 'onCheckedChange'
> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: ReactNode
  /** Count after the label ("Hide VIP 14"). */
  count?: ReactNode
  /**
   * `accent` (default): amber when on, for switches that change what the view shows ("Needs
   * attention only"). `neutral`: graphite (`--hg-fg-2`) when on, for configuration switches
   * (calendars, dispatch settings) so they don't compete with the view's one amber primary.
   */
  variant?: 'accent' | 'neutral'
}

/** 28 × 16, amber (or graphite, `variant="neutral"`) when on, label right (applies immediately). */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, label, count, variant = 'accent', className, id, ...props },
  ref,
) {
  const control = (
    <RadixSwitch.Root
      ref={ref}
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={cn(
        'hg-focus-on-accent relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border border-line-strong bg-pressed transition-colors',
        variant === 'accent'
          ? 'data-[state=checked]:border-accent-line data-[state=checked]:bg-accent'
          : 'data-[state=checked]:border-fg-2 data-[state=checked]:bg-fg-2',
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb
        className={cn(
          'block size-2.5 translate-x-[2px] rounded-full bg-fg-2 transition-transform duration-[var(--hg-dur-fast)] ease-out data-[state=checked]:translate-x-[14px]',
          variant === 'accent'
            ? 'data-[state=checked]:bg-fg-on-accent'
            : 'data-[state=checked]:bg-surface',
        )}
      />
    </RadixSwitch.Root>
  )
  if (!label) return control
  return (
    <label className="inline-flex h-control cursor-pointer items-center gap-2 rounded-sm px-1.5 whitespace-nowrap text-fg-2 hover:bg-hover hover:text-fg">
      {control}
      <span>{label}</span>
      {count !== undefined && <span className="font-mono text-2xs text-fg-3">{count}</span>}
    </label>
  )
})
