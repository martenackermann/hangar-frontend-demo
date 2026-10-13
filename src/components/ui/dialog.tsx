import { X } from 'lucide-react'
import { AlertDialog, Dialog as RadixDialog } from 'radix-ui'
import { useRef, useState, type ReactNode } from 'react'
import { useShortcut } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { Icon } from './icon'
import { Field, Textarea } from './input'

/**
 * Dialog (DESIGN.md §10): modal only for protected focus or confirmation. 8 px radius, dialog
 * shadow, scrim. Title states the action, body the consequences, buttons name the action.
 * Focus trapped, Esc cancels, ⌘⏎ confirms.
 */
export const Dialog = RadixDialog.Root
export const DialogTrigger = RadixDialog.Trigger
export const DialogClose = RadixDialog.Close

const overlayClass = 'fixed inset-0 z-[60] bg-scrim animate-fade-in'
const contentClass =
  'fixed top-[14vh] left-1/2 z-[60] grid max-h-[80vh] w-[min(560px,calc(100vw-24px))] -translate-x-1/2 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-line bg-overlay text-fg shadow-dialog animate-pop-in outline-none'

export function DialogContent({
  title,
  description,
  children,
  footer,
  className,
  onEscapeKeyDown,
  hideClose,
}: {
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  className?: string
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  hideClose?: boolean
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className={overlayClass} />
      <RadixDialog.Content
        className={cn(contentClass, className)}
        onEscapeKeyDown={onEscapeKeyDown}
        onOpenAutoFocus={(event) => {
          // Start in the body (`data-autofocus`, else the first field), never on the close button.
          const target = bodyRef.current?.querySelector<HTMLElement>(
            '[data-autofocus], input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])',
          )
          if (target) {
            event.preventDefault()
            target.focus()
          }
        }}
      >
        <div className="flex items-start gap-3 border-b border-line-subtle px-4 pt-4 pb-3">
          <div className="grid min-w-0 flex-1 gap-1">
            <RadixDialog.Title className="text-lg font-semibold">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="text-sm text-fg-2">
                {description}
              </RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
            )}
          </div>
          {!hideClose && (
            <RadixDialog.Close
              aria-label="Close"
              className="grid size-7 place-items-center rounded-sm text-fg-2 hover:bg-hover hover:text-fg"
            >
              <Icon icon={X} />
            </RadixDialog.Close>
          )}
        </div>
        <div ref={bodyRef} className="overflow-y-auto px-4 py-3">
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line-subtle bg-surface px-4 py-3">
            {footer}
          </div>
        )}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
}

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** "Send call-off order to Initech Logistics?" */
  title: ReactNode
  /** Consequences, with numbers. */
  description?: ReactNode
  children?: ReactNode
  /** Names the action: "Send order", "Close inventory". */
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  /** Shows a comment textarea; `required` blocks confirm until filled. */
  comment?: { label?: string; required?: boolean; placeholder?: string }
  onConfirm: (comment: string | undefined) => void | Promise<void>
  pending?: boolean
}

/**
 * Confirmation for destructive / `requiresComment` actions (SCREENS.md §0 "Actions").
 * Uses AlertDialog (role="alertdialog"); ⌘⏎ confirms.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  comment,
  onConfirm,
  pending,
}: ConfirmDialogProps) {
  const [text, setText] = useState('')
  const commentMissing = Boolean(comment?.required) && text.trim() === ''
  const confirm = () => {
    if (commentMissing || pending) return
    void onConfirm(comment ? text.trim() || undefined : undefined)
  }
  useShortcut('mod+enter', confirm, { enabled: open, allowInDialog: true, allowInInput: true })

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setText('')
        onOpenChange(next)
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlayClass} />
        <AlertDialog.Content className={cn(contentClass, 'w-[min(480px,calc(100vw-24px))]')}>
          <div className="grid gap-1 px-4 pt-4 pb-3">
            <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-fg-2">
              {description ?? 'Please confirm.'}
            </AlertDialog.Description>
          </div>
          <div className="grid gap-3 overflow-y-auto px-4 pb-3">
            {children}
            {comment && (
              <Field label={comment.label ?? 'Comment'} required={comment.required}>
                {({ id, describedBy }) => (
                  <Textarea
                    id={id}
                    aria-describedby={describedBy}
                    value={text}
                    placeholder={comment.placeholder}
                    onChange={(event) => setText(event.target.value)}
                  />
                )}
              </Field>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line-subtle bg-surface px-4 py-3">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              disabled={commentMissing}
              loading={pending}
              shortcut="mod+enter"
              onClick={confirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
