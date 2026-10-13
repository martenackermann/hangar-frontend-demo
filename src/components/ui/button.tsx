import { cva, type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { Slot } from 'radix-ui'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Icon } from './icon'
import { ariaKeyshortcuts, Kbd } from './kbd'
import { Spinner } from './spinner'
import { Tooltip } from './tooltip'

/**
 * Button (DESIGN.md §10): [icon] label [Kbd hint] [count]. Variants `primary` (amber — one per
 * view), `secondary`, `ghost`, `danger`, `link`. Sizes sm 24 · md 28 · lg 32 · xl 40 · touch 48;
 * on touch devices (`pointer: coarse`) every size is at least 44 px tall (DESIGN.md §5, §14).
 * `loading` swaps the leading icon for a spinner and keeps the label (no width jump).
 * The primary focus ring sits 2 px out with a surface gap (`hg-focus-on-accent`), so it never
 * touches the amber.
 */
export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm border font-medium whitespace-nowrap select-none',
    'transition-[background-color,border-color,color] duration-[var(--hg-dur-instant)]',
    'focus-visible:outline-2 focus-visible:outline-focus',
    'disabled:cursor-not-allowed disabled:border-line-subtle disabled:bg-transparent disabled:text-fg-disabled',
    'aria-disabled:cursor-not-allowed aria-disabled:border-line-subtle aria-disabled:bg-transparent aria-disabled:text-fg-disabled',
  ],
  {
    variants: {
      variant: {
        primary:
          'hg-focus-on-accent border-transparent bg-accent text-fg-on-accent hover:bg-accent-hover active:bg-accent-press [&_svg]:text-fg-on-accent',
        secondary:
          'border-line bg-raised text-fg hover:border-line-strong hover:bg-hover focus-visible:outline-offset-1 active:bg-pressed [&_svg]:text-fg-2',
        ghost:
          'border-transparent bg-transparent text-fg-2 hover:bg-hover hover:text-fg focus-visible:outline-offset-1 active:bg-pressed',
        danger:
          'border-[color-mix(in_srgb,var(--hg-tone-critical)_45%,transparent)] bg-tone-critical-wash text-tone-critical-fg hover:border-tone-critical focus-visible:outline-offset-1 [&_svg]:text-tone-critical-fg',
        link: 'h-auto border-transparent bg-transparent px-0 text-accent-text underline-offset-2 hover:underline focus-visible:outline-offset-1',
      },
      size: {
        sm: 'h-6 gap-1 px-2 text-xs pointer-coarse:h-11',
        md: 'h-7 px-2.5 text-sm pointer-coarse:h-11',
        lg: 'h-8 px-3 text-sm pointer-coarse:h-11',
        xl: 'h-10 px-4 text-md pointer-coarse:h-11',
        touch: 'h-12 rounded-md px-[18px] text-md',
        control: 'h-control px-2.5 text-sm pointer-coarse:h-11',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  icon?: LucideIcon | undefined
  /** Trailing icon (e.g. chevron). */
  iconEnd?: LucideIcon | undefined
  /**
   * Shortcut shown inside the button (`Claim for personalization ⏎`). The key cap is hidden
   * from assistive tech and on touch devices; the button gets `aria-keyshortcuts` instead.
   */
  shortcut?: string | undefined
  /** Trailing count chip (`Send due mails 38`). */
  count?: ReactNode
  loading?: boolean
  /**
   * Render as the child element (e.g. a router Link) with button styling. Icon, count,
   * shortcut and `iconEnd` render inside the child around its own content:
   * `<Button asChild icon={Plus} shortcut="n"><Link to="…">New request</Link></Button>`.
   */
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size,
    icon,
    iconEnd,
    shortcut,
    count,
    loading = false,
    asChild = false,
    className,
    children,
    disabled,
    type,
    ...props
  },
  ref,
) {
  const iconSize = size === 'touch' || size === 'xl' ? 16 : 14
  // Slottable: with `asChild` the child (e.g. a Link) becomes the root element and keeps the
  // icon, count, key cap and trailing icon around its own children (Radix Slot pattern).
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp
      ref={ref}
      {...(asChild ? {} : { type: type ?? 'button', disabled })}
      aria-busy={loading || undefined}
      aria-keyshortcuts={ariaKeyshortcuts(shortcut)}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? <Spinner size={iconSize} /> : icon ? <Icon icon={icon} size={iconSize} /> : null}
      <Slot.Slottable>{children}</Slot.Slottable>
      {count !== undefined && count !== null && (
        <span
          className={cn(
            'rounded-xs px-1.5 font-mono text-2xs leading-4',
            variant === 'primary' ? 'bg-[rgb(27_19_0/0.14)]' : 'bg-pressed text-fg-2',
          )}
        >
          {count}
        </span>
      )}
      {shortcut && <Kbd keys={shortcut} hint tone={variant === 'primary' ? 'accent' : 'default'} />}
      {iconEnd && <Icon icon={iconEnd} size={14} className="text-fg-3" />}
    </Comp>
  )
})

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon
  /** Required accessible name; also the tooltip text. */
  label: string
  shortcut?: string | undefined
  size?: 'sm' | 'md' | 'lg' | 'touch'
  /** Amber notification dot. */
  badge?: boolean
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
  /** Rail variant: graphite colours. */
  tone?: 'default' | 'rail'
  active?: boolean
}

/** Icon-only button: `aria-label` + tooltip with the shortcut (DESIGN.md §10). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    label,
    shortcut,
    size = 'md',
    badge,
    tooltipSide,
    tone = 'default',
    active,
    className,
    type,
    ...props
  },
  ref,
) {
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      <button
        ref={ref}
        type={type ?? 'button'}
        aria-label={label}
        aria-keyshortcuts={ariaKeyshortcuts(shortcut)}
        className={cn(
          'relative inline-grid shrink-0 place-items-center rounded-sm transition-colors duration-[var(--hg-dur-instant)]',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
          'disabled:text-fg-disabled disabled:hover:bg-transparent',
          // ≥ 44 px targets on touch devices (DESIGN.md §5, §14).
          size === 'sm' && 'size-6 pointer-coarse:size-11',
          size === 'md' && 'size-7 pointer-coarse:size-11',
          size === 'lg' && 'size-8 pointer-coarse:size-11',
          size === 'touch' && 'size-12',
          tone === 'default' && 'text-fg-2 hover:bg-hover hover:text-fg',
          tone === 'default' && active && 'bg-pressed text-fg',
          tone === 'rail' && 'text-rail-fg-3 hover:bg-rail-hover hover:text-rail-fg',
          className,
        )}
        {...props}
      >
        <Icon icon={icon} size={size === 'touch' ? 20 : 16} />
        {badge && (
          <span className="absolute top-1 right-1 size-[7px] rounded-full bg-accent shadow-[0_0_0_2px_var(--hg-canvas)]" />
        )}
      </button>
    </Tooltip>
  )
})
