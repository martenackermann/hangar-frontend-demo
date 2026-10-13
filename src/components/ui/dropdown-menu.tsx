import { Check, ChevronRight, Circle, type LucideIcon } from 'lucide-react'
import { DropdownMenu as Menu } from 'radix-ui'
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Icon } from './icon'
import { ariaKeyshortcuts, Kbd } from './kbd'
import { floatingSurface } from './popover'

/**
 * DropdownMenu (DESIGN.md §10): 30 px items, icon 16 fg-3 · label · shortcut right; group
 * labels 11 px; hairline separators; destructive items in critical-fg at the end.
 */
export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger
export const DropdownMenuGroup = Menu.Group
export const DropdownMenuRadioGroup = Menu.RadioGroup
export const DropdownMenuSub = Menu.Sub

export const DropdownMenuContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Menu.Content>
>(function DropdownMenuContent({ className, sideOffset = 6, align = 'end', ...props }, ref) {
  return (
    <Menu.Portal>
      <Menu.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(floatingSurface, 'min-w-[200px]', className)}
        {...props}
      />
    </Menu.Portal>
  )
})

const itemClass = cn(
  'relative flex h-[30px] cursor-default items-center gap-2 rounded-xs px-2 whitespace-nowrap text-fg outline-none select-none',
  'data-[disabled]:text-fg-disabled data-[highlighted]:bg-hover',
)

export interface DropdownMenuItemProps extends ComponentPropsWithoutRef<typeof Menu.Item> {
  icon?: LucideIcon | undefined
  shortcut?: string | undefined
  destructive?: boolean
  /** Secondary line/hint on the right (e.g. disabled reason). */
  hint?: ReactNode
}

export const DropdownMenuItem = forwardRef<HTMLDivElement, DropdownMenuItemProps>(
  function DropdownMenuItem(
    { icon, shortcut, destructive, hint, className, children, ...props },
    ref,
  ) {
    return (
      <Menu.Item
        ref={ref}
        aria-keyshortcuts={ariaKeyshortcuts(shortcut)}
        className={cn(itemClass, destructive && 'text-tone-critical-fg', className)}
        {...props}
      >
        {icon && (
          <Icon icon={icon} className={destructive ? 'text-tone-critical-fg' : 'text-fg-3'} />
        )}
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {hint && <span className="text-xs text-fg-3">{hint}</span>}
        {shortcut && <Kbd keys={shortcut} hint />}
      </Menu.Item>
    )
  },
)

export const DropdownMenuCheckboxItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Menu.CheckboxItem>
>(function DropdownMenuCheckboxItem({ className, children, ...props }, ref) {
  return (
    <Menu.CheckboxItem ref={ref} className={cn(itemClass, 'pl-7', className)} {...props}>
      <span className="absolute left-2 inline-grid size-4 place-items-center">
        <Menu.ItemIndicator>
          <Icon icon={Check} size={14} className="text-accent-text" />
        </Menu.ItemIndicator>
      </span>
      {children}
    </Menu.CheckboxItem>
  )
})

export const DropdownMenuRadioItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Menu.RadioItem> & { description?: ReactNode }
>(function DropdownMenuRadioItem({ className, children, description, ...props }, ref) {
  return (
    <Menu.RadioItem
      ref={ref}
      className={cn(itemClass, 'h-auto min-h-[30px] py-1.5 pl-7', className)}
      {...props}
    >
      <span className="absolute top-2 left-2 inline-grid size-4 place-items-center">
        <Menu.ItemIndicator>
          <Icon icon={Circle} size={12} className="fill-accent text-accent" />
        </Menu.ItemIndicator>
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate">{children}</span>
        {description && <span className="text-xs whitespace-normal text-fg-3">{description}</span>}
      </span>
    </Menu.RadioItem>
  )
})

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return (
    <Menu.Label className="px-2 pt-1.5 pb-0.5 text-2xs font-medium text-fg-3">
      {children}
    </Menu.Label>
  )
}

export function DropdownMenuSeparator() {
  return <Menu.Separator className="-mx-1 my-1 h-px bg-line" />
}

export const DropdownMenuSubTrigger = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Menu.SubTrigger> & { icon?: LucideIcon }
>(function DropdownMenuSubTrigger({ className, children, icon, ...props }, ref) {
  return (
    <Menu.SubTrigger
      ref={ref}
      className={cn(itemClass, 'data-[state=open]:bg-hover', className)}
      {...props}
    >
      {icon && <Icon icon={icon} className="text-fg-3" />}
      <span className="flex-1">{children}</span>
      <Icon icon={ChevronRight} size={14} className="text-fg-3" />
    </Menu.SubTrigger>
  )
})

export const DropdownMenuSubContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Menu.SubContent>
>(function DropdownMenuSubContent({ className, ...props }, ref) {
  return (
    <Menu.Portal>
      <Menu.SubContent
        ref={ref}
        className={cn(floatingSurface, 'min-w-[180px]', className)}
        {...props}
      />
    </Menu.Portal>
  )
})
