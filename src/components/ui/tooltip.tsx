import { Tooltip as RadixTooltip } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Kbd } from './kbd'

/** One provider at the root (DESIGN.md §10: 400 ms delay). */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={400} skipDelayDuration={200}>
      {children}
    </RadixTooltip.Provider>
  )
}

export interface TooltipProps {
  content: ReactNode
  /** Shortcut shown in the tooltip, e.g. `mod+k`. */
  shortcut?: string | undefined
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  children: ReactNode
  /** Disable without unmounting the trigger. */
  disabled?: boolean
}

/**
 * Inverted tooltip (fg background, 12 px) with an optional shortcut. The child must be a
 * focusable element that accepts a ref (Radix `asChild`).
 */
export function Tooltip({
  content,
  shortcut,
  side = 'bottom',
  align = 'center',
  children,
  disabled,
}: TooltipProps) {
  if (disabled || (!content && !shortcut)) return <>{children}</>
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'z-[70] inline-flex max-w-xs animate-fade-in items-center gap-2 rounded-xs bg-fg px-2 py-1 text-xs text-fg-inverse',
          )}
        >
          <span>{content}</span>
          {shortcut && <Kbd keys={shortcut} tone="inverse" />}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}
