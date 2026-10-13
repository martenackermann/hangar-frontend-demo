import { Lock, LockOpen, ScanBarcode, ScanLine } from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Icon } from '@/components/ui/icon'
import { Kbd } from '@/components/ui/kbd'
import { isModalOpen } from '@/lib/shortcuts'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'

/** Trim + upper-case (SCREENS.md §10). */
export function normalizeScan(raw: string): string {
  return raw.trim().toUpperCase()
}

/** Identical values within this window are a scanner bounce, not a duplicate (DESIGN.md §10). */
export const BOUNCE_MS = 800
const DOUBLE_ESC_MS = 600
export const REFOCUS_MS = 300

/** Menus, listboxes and popovers (Select, DropdownMenu, Popover); tooltips don't count. */
const POPPER_SELECTOR = ['listbox', 'menu', 'dialog']
  .map((role) => `[data-radix-popper-content-wrapper] [role="${role}"]`)
  .join(', ')

/** A dialog, the ⌘K palette, a sheet or a menu/listbox/popover is open. */
export function overlayOpen(): boolean {
  return isModalOpen() || document.querySelector(POPPER_SELECTOR) !== null
}

function isTypingElement(element: Element | null): boolean {
  return (
    element instanceof HTMLElement &&
    (element.isContentEditable || element.matches('input, textarea, select'))
  )
}

export interface RefocusState {
  /** The focus lock is on (not released with Esc Esc or Tab). */
  locked: boolean
  disabled: boolean
  /** The scan field. */
  input: HTMLElement | null
  /** `document.activeElement` */
  active: Element | null
  /** A dialog, palette, sheet, menu or popover is open right now. */
  overlay: boolean
  /** An overlay was open since the field lost focus (it has closed since). */
  afterOverlay: boolean
}

/**
 * The focus-lock rule (WCAG 2.1.2): the field takes focus back only while the lock is on and no
 * overlay is open, and only when focus was lost (it sits on `<body>`) or an overlay that opened
 * over the station has closed. It never takes focus from a control or field the user moved to.
 */
export function shouldRefocus(state: RefocusState): boolean {
  const { locked, disabled, input, active, overlay, afterOverlay } = state
  if (!locked || disabled || !input || overlay || active === input) return false
  const lost = active === null || active === input.ownerDocument.body
  if (lost) return true
  return afterOverlay && !isTypingElement(active)
}

export interface ScanInputHandle {
  focus: () => void
  /** Focuses the field only while the lock is on (after closing the camera, changing the hub…). */
  refocus: () => void
  lock: () => void
  release: () => void
}

export interface ScanInputProps {
  onSubmit: (value: string) => void
  /** Visible label above the field ("Scan serial or asset tag"). */
  label: string
  placeholder?: string
  /**
   * Focus lock: lost focus comes back unless a dialog/palette is open; Esc Esc (or Tab) releases,
   * Enter or a click on the field locks again. Off on touch devices (it would keep the soft
   * keyboard up).
   */
  focusLock?: boolean
  disabled?: boolean
  /** Shown instead of the placeholder while disabled ("Offline — scanning needs a connection."). */
  disabledReason?: string
  /** 56 px compact variant (personalization, parcel packing). */
  compact?: boolean
  normalize?: (raw: string) => string
  className?: string
  /** Extra controls on the right of the label row (camera button, sound toggle). */
  tools?: ReactNode
  /** Scan mode is active: the lock is on and the field has focus (session bar pill). */
  onActiveChange?: (active: boolean) => void
}

/**
 * ScanInput (DESIGN.md §10): 80 px (72 mobile, 56 compact), 2 px amber line + 4 px halo while
 * focus-locked, `scan-barcode` 32 px, mono 34 px upper-case, ⏎ key. Accepts keyboard-wedge
 * scanners (Enter suffix). The lock state is shown in words.
 */
export const ScanInput = forwardRef<ScanInputHandle, ScanInputProps>(function ScanInput(
  {
    onSubmit,
    label,
    placeholder = 'Waiting for scanner…',
    focusLock = true,
    disabled = false,
    disabledReason,
    compact,
    normalize = normalizeScan,
    className,
    tools,
    onActiveChange,
  },
  ref,
) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const coarse = useMediaQuery('(pointer: coarse)')
  const lockable = focusLock && !coarse
  const [value, setValue] = useState('')
  // `lockedRef` is the truth for event handlers and timers (a render may not have happened yet
  // when the field blurs right after Esc Esc); the state drives the visible lock text.
  const [locked, setLockedState] = useState(true)
  const lockedRef = useRef(true)
  const lockableRef = useRef(lockable)
  const disabledRef = useRef(disabled)
  const [focused, setFocused] = useState(false)
  const lastEsc = useRef(0)
  const lastSubmit = useRef<{ value: string; at: number } | null>(null)
  const refocusTimer = useRef<number | undefined>(undefined)
  const afterOverlay = useRef(false)

  useEffect(() => {
    lockableRef.current = lockable
    disabledRef.current = disabled
  })

  const setLock = useCallback((next: boolean) => {
    lockedRef.current = next
    setLockedState(next)
  }, [])

  const focus = useCallback(() => inputRef.current?.focus(), [])

  const check = useCallback(() => {
    const input = inputRef.current
    const overlay = overlayOpen()
    if (overlay) afterOverlay.current = true
    const refocus = shouldRefocus({
      locked: lockedRef.current && lockableRef.current,
      disabled: disabledRef.current,
      input,
      active: document.activeElement,
      overlay,
      afterOverlay: afterOverlay.current,
    })
    if (refocus) {
      afterOverlay.current = false
      input?.focus()
    }
  }, [])

  const scheduleCheck = useCallback(() => {
    window.clearTimeout(refocusTimer.current)
    refocusTimer.current = window.setTimeout(check, REFOCUS_MS)
  }, [check])

  useImperativeHandle(
    ref,
    () => ({
      focus,
      refocus: () => {
        if (lockedRef.current && lockableRef.current) focus()
      },
      lock: () => {
        setLock(true)
        focus()
      },
      release: () => {
        setLock(false)
        window.clearTimeout(refocusTimer.current)
        inputRef.current?.blur()
      },
    }),
    [focus, setLock],
  )

  // Grab focus on mount and when scanning becomes possible again (back online).
  useEffect(() => {
    if (lockable && lockedRef.current && !disabled) focus()
  }, [lockable, disabled, focus])

  useEffect(() => () => window.clearTimeout(refocusTimer.current), [])

  const isLocked = lockable && locked
  const active = isLocked && focused && !disabled

  const onActiveChangeRef = useRef(onActiveChange)
  useEffect(() => {
    onActiveChangeRef.current = onActiveChange
  })
  useEffect(() => {
    onActiveChangeRef.current?.(active)
  }, [active])

  // While locked but unfocused, watch overlays (portals under <body>) come and go: when a dialog
  // that opened over the station closes, the field takes the focus back.
  useEffect(() => {
    if (!isLocked || focused || disabled) return
    const observer = new MutationObserver(scheduleCheck)
    observer.observe(document.body, { childList: true })
    return () => observer.disconnect()
  }, [isLocked, focused, disabled, scheduleCheck])

  const submit = () => {
    const normalized = normalize(value)
    setValue('')
    if (!normalized) return
    const now = Date.now()
    const previous = lastSubmit.current
    lastSubmit.current = { value: normalized, at: now }
    if (previous?.value === normalized && now - previous.at < BOUNCE_MS) return
    onSubmit(normalized)
  }

  const height = compact ? 'h-14' : 'h-scan max-md:h-[72px]'

  return (
    <div className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2', className)}>
      {/* Wraps on phones (390 px) instead of widening the page. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label htmlFor={id} className="min-w-0 text-md font-semibold">
          {label}
        </label>
        <div className="flex min-w-0 items-center gap-2 text-xs">
          {lockable && (
            <span
              className={cn(
                'inline-flex min-w-0 items-center gap-1.5',
                active ? 'text-accent-text' : 'text-fg-3',
              )}
              data-testid="scan-lock-state"
            >
              <Icon icon={isLocked ? Lock : LockOpen} size={14} className="shrink-0" />
              {disabled
                ? 'Scanning paused'
                : isLocked
                  ? focused
                    ? 'Focus locked · Esc Esc to release'
                    : 'Focus lock paused · click the field to resume'
                  : 'Focus released · press Enter or click the field to lock'}
            </span>
          )}
          {tools}
        </div>
      </div>
      {/* Clicking anywhere on the frame locks and focuses; keyboard users reach the input directly. */}
      <div
        role="presentation"
        className={cn(
          'flex items-center gap-4 rounded-md border-2 bg-sunken px-5 transition-shadow max-md:gap-3 max-md:px-3.5',
          height,
          disabled
            ? 'border-line'
            : active
              ? 'border-accent-line shadow-[0_0_0_4px_color-mix(in_srgb,var(--hg-accent)_22%,transparent)]'
              : focused
                ? 'border-accent-line'
                : 'border-line-strong',
        )}
        onClick={() => {
          if (disabled) return
          setLock(true)
          focus()
        }}
      >
        <Icon
          icon={compact ? ScanLine : ScanBarcode}
          size={32}
          className={cn(
            'shrink-0 max-md:size-6',
            disabled ? 'text-fg-disabled' : 'text-accent-text',
          )}
        />
        <input
          ref={inputRef}
          id={id}
          value={value}
          disabled={disabled}
          placeholder={disabled ? (disabledReason ?? 'Scanning paused') : placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="go"
          aria-describedby={lockable ? `${id}-lock` : undefined}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => {
            setFocused(true)
            afterOverlay.current = false
            window.clearTimeout(refocusTimer.current)
          }}
          onBlur={() => {
            setFocused(false)
            if (!(lockedRef.current && lockableRef.current) || disabledRef.current) return
            scheduleCheck()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              setLock(true)
              submit()
            } else if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
              // Leaving with the keyboard is a decision: release, and never pull focus back.
              setLock(false)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              if (value) {
                setValue('')
                return
              }
              const now = Date.now()
              if (now - lastEsc.current < DOUBLE_ESC_MS) {
                setLock(false)
                window.clearTimeout(refocusTimer.current)
                inputRef.current?.blur()
              }
              lastEsc.current = now
            }
          }}
          className={cn(
            'h-full min-w-0 flex-1 bg-transparent font-mono tracking-[0.06em] uppercase outline-none placeholder:font-sans placeholder:tracking-normal placeholder:normal-case',
            compact ? 'text-[24px]' : 'text-[34px] max-md:text-[24px]',
          )}
        />
        <Kbd>⏎</Kbd>
      </div>
      {lockable && (
        <span id={`${id}-lock`} className="sr-only">
          {isLocked
            ? 'Focus locked. Press Escape twice to release.'
            : 'Focus released. Press Enter or click the field to lock.'}
        </span>
      )}
    </div>
  )
})
