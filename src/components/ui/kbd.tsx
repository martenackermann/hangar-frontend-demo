import type { ReactNode } from 'react'
import { displayKeys, isMac } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'

/**
 * Keyboard key (DESIGN.md §10 Kbd): 18 px, mono 10.5 px, hairline with an inset bottom edge.
 * `<Kbd keys="mod+k" />` renders ⌘ K (Ctrl K off macOS); `<Kbd>Esc</Kbd>` renders one key.
 * `tone="accent"` inside amber buttons, `tone="rail"` on the graphite rail.
 *
 * `hint`: the key is a shortcut hint next to a control (inside a button, menu item, toast
 * action, search field). Hints are hidden from assistive tech (the control carries
 * `aria-keyshortcuts` instead, see `ariaKeyshortcuts`) and hidden on touch devices
 * (`pointer: coarse`), where they mean nothing. Keys that are content (the shortcut sheet,
 * "Keys 1–4" on the login page) leave `hint` off.
 */
export function Kbd({
  keys,
  children,
  tone = 'default',
  hint = false,
  className,
}: {
  keys?: string
  children?: ReactNode
  tone?: 'default' | 'accent' | 'rail' | 'inverse'
  hint?: boolean
  className?: string
}) {
  const items = keys ? displayKeys(keys) : [children]
  return (
    <span
      aria-hidden={hint || undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-[3px]',
        hint && 'pointer-coarse:hidden',
        className,
      )}
    >
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

const ARIA_KEYS: Record<string, string> = {
  ctrl: 'Control',
  alt: 'Alt',
  shift: 'Shift',
  enter: 'Enter',
  return: 'Enter',
  esc: 'Escape',
  escape: 'Escape',
  space: 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  home: 'Home',
  end: 'End',
}

/**
 * `aria-keyshortcuts` value for a shortcut in `useShortcut` syntax: `mod+enter` → `Meta+Enter`
 * (macOS) / `Control+Enter`, `shift+x` → `Shift+X`. Sequences (`g p`) can't be expressed in
 * ARIA (a space separates alternatives), so they return `undefined`.
 */
export function ariaKeyshortcuts(keys: string | undefined): string | undefined {
  if (!keys) return undefined
  const trimmed = keys.trim()
  if (!trimmed || /\s/.test(trimmed)) return undefined
  return trimmed
    .split('+')
    .map((part) => {
      const lower = part.toLowerCase()
      if (lower === 'mod' || lower === 'cmd') return isMac ? 'Meta' : 'Control'
      return ARIA_KEYS[lower] ?? (part.length === 1 ? part.toUpperCase() : part)
    })
    .join('+')
}
