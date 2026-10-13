import { CircleAlert, ListFilter, X, type LucideIcon } from 'lucide-react'
import { Label } from 'radix-ui'
import {
  forwardRef,
  useId,
  useImperativeHandle,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { useShortcut } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { Icon } from './icon'
import { Kbd } from './kbd'

/** Shared input frame: sunken well, line-strong border, focus ring (DESIGN.md §10 Input). */
export const inputFrame = cn(
  'flex h-control min-w-0 items-center gap-1.5 rounded-sm border border-line-strong bg-sunken px-2 text-md text-fg',
  'focus-within:border-focus focus-within:shadow-[0_0_0_1px_var(--hg-focus)]',
  'has-[input:disabled]:border-line has-[input:disabled]:text-fg-disabled',
  'aria-invalid:border-tone-critical',
)

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  icon?: LucideIcon | undefined
  /** Trailing content inside the frame (unit, kbd, button). */
  end?: ReactNode
  invalid?: boolean
  frameClassName?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, end, invalid, className, frameClassName, ...props },
  ref,
) {
  return (
    <div className={cn(inputFrame, frameClassName)} aria-invalid={invalid || undefined}>
      {icon && <Icon icon={icon} size={14} className="text-fg-3" />}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn('h-full min-w-0 flex-1 bg-transparent outline-none', className)}
        {...props}
      />
      {end}
    </div>
  )
})

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ invalid, className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'min-h-20 w-full rounded-sm border border-line-strong bg-sunken px-2 py-1.5 text-md text-fg outline-none',
        'focus:border-focus focus:shadow-[0_0_0_1px_var(--hg-focus)] aria-invalid:border-tone-critical',
        className,
      )}
      {...props}
    />
  )
})

export interface SearchInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value' | 'size'
> {
  value: string
  onValueChange: (value: string) => void
  /** Register `/` to focus this input (one per screen). */
  slashShortcut?: boolean
  frameClassName?: string
}

/**
 * Filter-as-you-type (DESIGN.md §10 SearchInput): leading `list-filter`, clear button, `/`
 * focuses it, `Esc` clears then blurs.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onValueChange, slashShortcut = false, frameClassName, placeholder, ...props },
  ref,
) {
  const innerRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => innerRef.current!)
  useShortcut('/', () => innerRef.current?.focus(), {
    enabled: slashShortcut,
    description: 'Focus search',
    group: 'Lists',
  })
  return (
    <div className={cn(inputFrame, frameClassName)}>
      <Icon icon={ListFilter} size={14} className="text-fg-3" />
      <input
        ref={innerRef}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            if (value) onValueChange('')
            else event.currentTarget.blur()
            event.preventDefault()
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent outline-none [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onValueChange('')
            innerRef.current?.focus()
          }}
          className="grid size-5 place-items-center rounded-2xs text-fg-3 hover:bg-hover hover:text-fg"
        >
          <Icon icon={X} size={14} />
        </button>
      ) : (
        slashShortcut && <Kbd>/</Kbd>
      )}
    </div>
  )
})

export interface FieldProps {
  label: ReactNode
  /** Help text below the control. */
  help?: ReactNode
  error?: string | undefined
  required?: boolean
  className?: string
  /** Render prop receives the generated ids for the control. */
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
}

/** Label above (12 px fg-2), help below (12 px fg-3), error in critical-fg with icon. */
export function Field({ label, help, error, required, className, children }: FieldProps) {
  const id = useId()
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ')
  return (
    <div className={cn('grid gap-1', className)}>
      <Label.Root htmlFor={id} className="text-xs text-fg-2">
        {label}
        {required && <span className="text-fg-3"> (required)</span>}
      </Label.Root>
      {children({ id, describedBy: describedBy || undefined, invalid: Boolean(error) })}
      {help && !error && (
        <p id={helpId} className="text-xs text-fg-3">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-center gap-1 text-xs text-tone-critical-fg">
          <Icon icon={CircleAlert} size={12} />
          {error}
        </p>
      )}
    </div>
  )
}
