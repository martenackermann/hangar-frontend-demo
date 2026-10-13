import { createStore, useSelector } from '@tanstack/react-store'
import { useEffect, useRef } from 'react'
import { prefsStore } from '@/lib/prefs/store'

/**
 * Keyboard shortcuts (SCREENS.md §1.4, DESIGN.md §10). One global keydown listener; screens
 * register handlers with `useShortcut`, which also feeds the `?` help sheet.
 *
 * Key syntax: `mod+k` (⌘ on macOS, Ctrl elsewhere), `shift+x`, `alt+arrowup`, `escape`,
 * `enter`, `f2`, `?`, `/`, `[`, and sequences separated by a space: `g p`.
 *
 * Rules: shortcuts are ignored while typing in inputs (unless `allowInInput`, e.g. Esc, ⌘K),
 * while a modal dialog is open (unless `allowInDialog`), and single-key shortcuts can be
 * turned off by the user (WCAG 2.1.4). The most recently registered handler for a key wins.
 */

export type ShortcutGroup =
  'Global' | 'Navigation' | 'Lists' | 'Drawer' | 'Scan station' | 'Page' | (string & {})

export interface ShortcutOptions {
  /** Shown in the help sheet; omit to hide the entry. */
  description?: string
  group?: ShortcutGroup
  enabled?: boolean
  allowInInput?: boolean
  allowInDialog?: boolean
  /** Call preventDefault (default true). */
  preventDefault?: boolean
}

interface Registration extends ShortcutOptions {
  id: number
  keys: string
  handler: (event: KeyboardEvent) => void
}

export interface ShortcutHelpEntry {
  id: number
  keys: string
  description: string
  group: ShortcutGroup
}

const registrations: Registration[] = []
let nextId = 1

/** Active, described shortcuts (help sheet). */
export const shortcutHelpStore = createStore<ShortcutHelpEntry[]>([])

function publishHelp(): void {
  const seen = new Set<string>()
  const entries: ShortcutHelpEntry[] = []
  for (const reg of [...registrations].reverse()) {
    if (!reg.description || reg.enabled === false) continue
    const key = `${reg.group ?? 'Page'}|${reg.keys}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({
      id: reg.id,
      keys: reg.keys,
      description: reg.description,
      group: reg.group ?? 'Page',
    })
  }
  shortcutHelpStore.setState(() => entries.reverse())
}

// ---- platform & key normalisation ----------------------------------------------------------

export const isMac: boolean =
  typeof navigator !== 'undefined' &&
  /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  ' ': 'space',
  spacebar: 'space',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  return: 'enter',
}

/** Normalised combo of a keyboard event, e.g. `mod+shift+k`, `?`, `g`. */
export function comboFromEvent(event: KeyboardEvent): string {
  const raw = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase()
  const key = KEY_ALIASES[raw] ?? raw
  const isLetter = /^[a-z]$/.test(key)
  const isPrintableSymbol = key.length === 1 && !isLetter && !/^[0-9]$/.test(key)
  const mods: string[] = []
  if (isMac ? event.metaKey : event.ctrlKey) mods.push('mod')
  if (isMac && event.ctrlKey) mods.push('ctrl')
  if (event.altKey) mods.push('alt')
  // `?` is shift+/ on most layouts: printable symbols ignore shift.
  if (event.shiftKey && !isPrintableSymbol) mods.push('shift')
  return [...mods, key].join('+')
}

function normaliseCombo(combo: string): string {
  const parts = combo.toLowerCase().split('+')
  const key = parts.pop() ?? ''
  const mods = new Set(parts.map((p) => (p === 'ctrl' && !isMac ? 'mod' : p === 'cmd' ? 'mod' : p)))
  const order = ['mod', 'ctrl', 'alt', 'shift'].filter((m) => mods.has(m))
  return [...order, KEY_ALIASES[key] ?? key].join('+')
}

function steps(keys: string): string[] {
  return keys.trim().split(/\s+/).map(normaliseCombo)
}

function isSingleKey(keys: string): boolean {
  const s = steps(keys)
  return s.every(
    (step) => !step.includes('mod+') && !step.includes('alt+') && !step.includes('ctrl+'),
  )
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(type)
  }
  return target.closest('[cmdk-input], [role="combobox"]') !== null
}

/** Enter/Space on a focused control belong to that control (button, link, checkbox, tab…). */
function isActivationTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.closest(
      'button, a[href], input, select, textarea, summary, [role="button"], [role="checkbox"], [role="switch"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="tab"], [role="radio"], [role="link"]',
    ) !== null
  )
}

/**
 * Open modal layers: Radix Dialog/AlertDialog content (`data-state="open"`; Radix sets no
 * `aria-modal`), the ⌘K palette and any other `aria-modal` dialog. Popovers also render
 * `role="dialog"` but inside a popper wrapper; they are not modal and don't count.
 */
const MODAL_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="dialog"][aria-modal="true"]',
  '[role="alertdialog"][aria-modal="true"]',
  '[cmdk-dialog]',
].join(', ')

/** True while a modal dialog, sheet or the command palette is open (shortcuts and the scan lock pause). */
export function isModalOpen(root: ParentNode = document): boolean {
  for (const element of root.querySelectorAll(MODAL_SELECTOR)) {
    if (!element.closest('[data-radix-popper-content-wrapper]')) return true
  }
  return false
}

// ---- dispatcher --------------------------------------------------------------------------

let pending: { step: string; at: number } | null = null
const SEQUENCE_TIMEOUT = 900

function onKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing) return
  const combo = comboFromEvent(event)
  if (['shift', 'control', 'alt', 'meta', 'mod'].includes(combo.split('+').pop() ?? '')) return

  if ((combo === 'enter' || combo === 'space') && isActivationTarget(event.target)) return
  const typing = isTypingTarget(event.target)
  const inModal = isModalOpen()
  const singleKeysOn = prefsStore.get().singleKeyShortcuts
  const now = Date.now()
  const prefix = pending && now - pending.at < SEQUENCE_TIMEOUT ? pending.step : null

  const candidates = [...registrations].reverse().filter((reg) => {
    if (reg.enabled === false) return false
    if (typing && !reg.allowInInput) return false
    if (inModal && !reg.allowInDialog) return false
    if (!singleKeysOn && isSingleKey(reg.keys)) return false
    return true
  })

  // 1) complete a sequence (`g` then `p`)
  if (prefix) {
    const match = candidates.find((reg) => {
      const s = steps(reg.keys)
      return s.length === 2 && s[0] === prefix && s[1] === combo
    })
    pending = null
    if (match) {
      if (match.preventDefault !== false) event.preventDefault()
      match.handler(event)
      return
    }
  }

  // 2) start a sequence
  const startsSequence = candidates.some((reg) => {
    const s = steps(reg.keys)
    return s.length === 2 && s[0] === combo
  })

  // 3) single-step shortcut
  const single = candidates.find((reg) => {
    const s = steps(reg.keys)
    return s.length === 1 && s[0] === combo
  })
  if (single && !startsSequence) {
    if (single.preventDefault !== false) event.preventDefault()
    single.handler(event)
    return
  }
  if (startsSequence) {
    pending = { step: combo, at: now }
    event.preventDefault()
  }
}

let installed = false

/** Installs the global listener once (called by the app root). */
export function installShortcuts(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('keydown', onKeyDown)
}

/** Register a shortcut imperatively; returns the unregister function. */
export function registerShortcut(
  keys: string,
  handler: (event: KeyboardEvent) => void,
  options: ShortcutOptions = {},
): () => void {
  const reg: Registration = { id: nextId++, keys, handler, ...options }
  registrations.push(reg)
  publishHelp()
  return () => {
    const index = registrations.indexOf(reg)
    if (index >= 0) registrations.splice(index, 1)
    publishHelp()
  }
}

/**
 * Register a shortcut for the lifetime of the component:
 *   useShortcut('g p', () => navigate({ to: '/pipeline' }), { description: 'Pipeline', group: 'Navigation' })
 * Accepts several key strings for the same action (`['j', 'arrowdown']`).
 */
export function useShortcut(
  keys: string | readonly string[],
  handler: (event: KeyboardEvent) => void,
  options: ShortcutOptions = {},
): void {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })
  const list = typeof keys === 'string' ? [keys] : keys
  const signature = list.join('|')
  const { description, group, enabled, allowInInput, allowInDialog, preventDefault } = options
  useEffect(() => {
    if (enabled === false) return
    const unregister = signature.split('|').map((k, index) =>
      registerShortcut(k, (event) => handlerRef.current(event), {
        // Only the first variant is listed in the help sheet.
        description: index === 0 ? description : undefined,
        group,
        allowInInput,
        allowInDialog,
        preventDefault,
      }),
    )
    return () => {
      for (const fn of unregister) fn()
    }
  }, [signature, description, group, enabled, allowInInput, allowInDialog, preventDefault])
}

export function useShortcutHelp(): ShortcutHelpEntry[] {
  return useSelector(shortcutHelpStore)
}

/** Keys for display: `mod+k` -> ['⌘', 'K'] (or ['Ctrl', 'K']); `g p` -> ['G', 'P']. */
export function displayKeys(keys: string): string[] {
  const labels: Record<string, string> = {
    mod: isMac ? '⌘' : 'Ctrl',
    ctrl: 'Ctrl',
    alt: isMac ? '⌥' : 'Alt',
    shift: '⇧',
    enter: '⏎',
    escape: 'Esc',
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    space: 'Space',
    backspace: '⌫',
    tab: 'Tab',
  }
  return keys
    .trim()
    .split(/\s+/)
    .flatMap((step) =>
      step.split('+').map((part) => {
        const lower = part.toLowerCase()
        return labels[lower] ?? (lower.length === 1 ? lower.toUpperCase() : part.toUpperCase())
      }),
    )
}
