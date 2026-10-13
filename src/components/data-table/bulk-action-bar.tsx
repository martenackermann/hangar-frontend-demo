import { Toolbar } from 'radix-ui'
import type { ReactNode } from 'react'
import { Kbd } from '@/components/ui/kbd'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * BulkActionBar (DESIGN.md §10): floats 16 px above the bottom of the table area when ≥ 1 row
 * is selected — amber count chip · "selected" · actions · "Clear Esc". Radix Toolbar (roving
 * focus). Docks to the bottom edge on phones. Pass actions as `<BulkAction>` children.
 */
export function BulkActionBar({
  count,
  onClear,
  children,
  className,
}: {
  count: number
  onClear: () => void
  children: ReactNode
  className?: string
}) {
  if (count === 0) return null
  return (
    <Toolbar.Root
      aria-label={`${count} selected`}
      className={cn(
        'absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 animate-slide-up items-center gap-0.5 rounded-md border border-line bg-overlay py-1 pr-1 pl-1.5 whitespace-nowrap shadow-bar',
        'max-md:fixed max-md:inset-x-2 max-md:bottom-2 max-md:translate-x-0 max-md:justify-between',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5 px-1.5 font-medium" aria-live="polite">
        <span className="inline-grid h-5 min-w-5 place-items-center rounded-xs bg-accent px-[5px] font-mono text-xs font-semibold text-fg-on-accent">
          {formatNumber(count)}
        </span>
        selected
      </span>
      <Toolbar.Separator className="mx-1 h-5 w-px bg-line" />
      {children}
      <Toolbar.Separator className="mx-1 h-5 w-px bg-line" />
      <Toolbar.Button
        onClick={onClear}
        className="inline-flex h-7 items-center gap-1.5 rounded-sm px-2 font-medium text-fg hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
      >
        Clear <Kbd className="max-md:hidden">Esc</Kbd>
      </Toolbar.Button>
    </Toolbar.Root>
  )
}

/** One action of the bulk bar (ghost button inside the Radix toolbar). */
export function BulkAction({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <Toolbar.Button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-7 items-center gap-1.5 rounded-sm px-2 font-medium text-fg hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus disabled:text-fg-disabled [&_svg]:size-3.5 [&_svg]:text-fg-2"
    >
      {children}
    </Toolbar.Button>
  )
}
