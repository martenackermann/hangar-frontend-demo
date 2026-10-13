import { Popover as RadixPopover } from 'radix-ui'
import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Popover (DESIGN.md §10): overlay surface, 6 px radius, 4 px padding, popover shadow.
 * Always portalled to <body> with a z-index above drawers, sheets and dialogs, so it is never
 * clipped by overflow ancestors (the comps' column chooser was). Radix sets `aria-expanded` /
 * `aria-controls` on the trigger.
 */
export const Popover = RadixPopover.Root
export const PopoverTrigger = RadixPopover.Trigger
export const PopoverAnchor = RadixPopover.Anchor
export const PopoverClose = RadixPopover.Close

/** Shared floating-surface classes (menus, selects, comboboxes). */
export const floatingSurface =
  'z-[70] rounded-md border border-line bg-overlay p-1 text-sm text-fg shadow-popover outline-none animate-pop-in'

export const PopoverContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixPopover.Content>
>(function PopoverContent({ className, sideOffset = 6, align = 'start', ...props }, ref) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(
          floatingSurface,
          'max-h-[var(--radix-popover-content-available-height)] min-w-[200px] overflow-auto',
          className,
        )}
        {...props}
      />
    </RadixPopover.Portal>
  )
})
