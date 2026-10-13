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
import { cn } from '@/lib/utils'

/** Trim + upper-case (SCREENS.md §10). */
export function normalizeScan(raw: string): string {
  return raw.trim().toUpperCase()
}

/** Identical values within this window are a scanner bounce, not a duplicate (DESIGN.md §10). */
export const BOUNCE_MS = 800
const DOUBLE_ESC_MS = 600
const REFOCUS_MS = 300

export interface ScanInputHandle {
  focus: () => void
  lock: () => void
  release: () => void
}

export interface ScanInputProps {
  onSubmit: (value: string) => void
  /** Visible label above the field ("Scan serial or asset tag"). */
  label: string
  placeholder?: string
  /** Focus lock: blur re-focuses unless a dialog/palette is open; Esc Esc releases. */
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
}

function overlayOpen(): boolean {
  return (
    document.querySelector(
      '[role="dialog"][aria-modal="true"], [role="alertdialog"], [cmdk-dialog]',
    ) !== null || document.querySelector('[data-radix-popper-content-wrapper]') !== null
  )
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
    disabled,
    disabledReason,
    compact,
    normalize = normalizeScan,
    className,
    tools,
  },
  ref,
) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [locked, setLocked] = useState(focusLock)
  const [focused, setFocused] = useState(false)
  const lastEsc = useRef(0)
  const lastSubmit = useRef<{ value: string; at: number } | null>(null)
  const refocusTimer = useRef<number | undefined>(undefined)

  const focus = useCallback(() => inputRef.current?.focus(), [])
  useImperativeHandle(ref, () => ({
    focus,
    lock: () => {
      setLocked(true)
      focus()
    },
    release: () => {
      setLocked(false)
      inputRef.current?.blur()
    },
  }))

  useEffect(() => {
    if (focusLock && !disabled) focus()
    return () => window.clearTimeout(refocusTimer.current)
  }, [focusLock, disabled, focus])

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

  const isLocked = focusLock && locked
  const height = compact ? 'h-14' : 'h-scan max-md:h-[72px]'

  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-md font-semibold">
          {label}
        </label>
        <div className="flex items-center gap-2 text-xs">
          {focusLock && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5',
                isLocked && focused ? 'text-accent-text' : 'text-fg-3',
              )}
            >
              <Icon icon={isLocked ? Lock : LockOpen} size={14} />
              {disabled
                ? 'Scanning paused'
                : isLocked
                  ? focused
                    ? 'Focus locked · every keystroke goes to the scanner field'
                    : 'Focus locked'
                  : 'Focus released · press Enter or click the field to lock'}
            </span>
          )}
          {tools}
        </div>
      </div>
      {/* Clicking anywhere on the frame re-locks focus; keyboard users reach the input directly. */}
      <div
        role="presentation"
        className={cn(
          'flex items-center gap-4 rounded-md border-2 bg-sunken px-5 transition-shadow',
          height,
          disabled
            ? 'border-line'
            : isLocked && focused
              ? 'border-accent-line shadow-[0_0_0_4px_color-mix(in_srgb,var(--hg-accent)_22%,transparent)]'
              : 'border-line-strong',
        )}
        onClick={() => {
          if (!disabled) {
            setLocked(true)
            focus()
          }
        }}
      >
        <Icon
          icon={compact ? ScanLine : ScanBarcode}
          size={32}
          className={disabled ? 'text-fg-disabled' : 'text-accent-text'}
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
          aria-describedby={`${id}-lock`}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => {
            setFocused(true)
            if (focusLock) setLocked(true)
          }}
          onBlur={() => {
            setFocused(false)
            if (!isLocked || disabled) return
            window.clearTimeout(refocusTimer.current)
            refocusTimer.current = window.setTimeout(() => {
              const active = document.activeElement
              const typingElsewhere =
                active instanceof HTMLElement &&
                active !== inputRef.current &&
                active.matches('input, textarea, select, [contenteditable="true"]')
              if (!overlayOpen() && !typingElsewhere) focus()
            }, REFOCUS_MS)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              if (value) {
                setValue('')
                return
              }
              const now = Date.now()
              if (now - lastEsc.current < DOUBLE_ESC_MS) {
                setLocked(false)
                inputRef.current?.blur()
              }
              lastEsc.current = now
            }
          }}
          className={cn(
            'h-full min-w-0 flex-1 bg-transparent font-mono tracking-[0.06em] uppercase outline-none placeholder:font-sans placeholder:tracking-normal placeholder:normal-case',
            compact ? 'text-[24px]' : 'text-[34px] max-md:text-[26px]',
          )}
        />
        <Kbd>⏎</Kbd>
      </div>
      <span id={`${id}-lock`} className="sr-only">
        {isLocked ? 'Focus locked. Press Escape twice to release.' : 'Focus released.'}
      </span>
    </div>
  )
})
