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

/** 14 px (18 touch), radius 3, amber when checked, dash for "some rows" (DESIGN.md §10). */
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
        'inline-grid shrink-0 place-items-center rounded-xs border border-line-strong bg-sunken transition-colors duration-[var(--hg-dur-instant)]',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
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
}

/** 28 × 16, amber when on, label right (applies immediately). */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, label, count, className, id, ...props },
  ref,
) {
  const control = (
    <RadixSwitch.Root
      ref={ref}
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={cn(
        'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border border-line-strong bg-pressed transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb className="block size-2.5 translate-x-[2px] rounded-full bg-fg-2 transition-transform duration-[var(--hg-dur-fast)] ease-out data-[state=checked]:translate-x-[14px] data-[state=checked]:bg-fg-on-accent" />
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
