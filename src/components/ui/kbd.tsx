import type { ReactNode } from 'react'
import { displayKeys } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'

/**
 * Keyboard key (DESIGN.md §10 Kbd): 18 px, mono 10.5 px, hairline with an inset bottom edge.
 * `<Kbd keys="mod+k" />` renders ⌘ K (Ctrl K off macOS); `<Kbd>Esc</Kbd>` renders one key.
 * `tone="accent"` inside amber buttons, `tone="rail"` on the graphite rail.
 */
export function Kbd({
  keys,
  children,
  tone = 'default',
  className,
}: {
  keys?: string
  children?: ReactNode
  tone?: 'default' | 'accent' | 'rail' | 'inverse'
  className?: string
}) {
  const items = keys ? displayKeys(keys) : [children]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-[3px]', className)}>
      {items.map((label, index) => (
        <kbd
          key={index}
          className={cn(
            'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border px-1 font-mono text-[10.5px] leading-none font-medium whitespace-nowrap not-italic',
            tone === 'default' &&
              'border-line bg-surface text-fg-2 shadow-[inset_0_-1px_0_var(--hg-line)]',
            tone === 'accent' &&
              'border-[rgb(27_19_0/0.22)] bg-[rgb(27_19_0/0.12)] text-fg-on-accent',
            tone === 'rail' && 'border-rail-active text-rail-fg-3',
            tone === 'inverse' &&
              'border-[color-mix(in_srgb,var(--hg-fg-inverse)_35%,transparent)] text-fg-inverse',
          )}
        >
          {label}
        </kbd>
      ))}
    </span>
  )
}
