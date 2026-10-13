import { fireEvent, render, screen } from '@testing-library/react'
import { Popover } from 'radix-ui'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog, Dialog, DialogContent } from '@/components/ui/dialog'
import { isMac, isModalOpen, registerShortcut } from './index'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanups.splice(0)) fn()
})

function register(keys: string, options: Parameters<typeof registerShortcut>[2] = {}) {
  const handler = vi.fn()
  cleanups.push(registerShortcut(keys, handler, options))
  return handler
}

function press(key: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init })
}

describe('isModalOpen (A11Y H2)', () => {
  it('is false with nothing open', () => {
    render(<p>Page</p>)
    expect(isModalOpen()).toBe(false)
  })

  it('detects an open Radix dialog by data-state (Radix sets no aria-modal)', () => {
    render(
      <Dialog open>
        <DialogContent title="Keyboard shortcuts">Body</DialogContent>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(dialog).not.toHaveAttribute('aria-modal')
    expect(dialog).toHaveAttribute('data-state', 'open')
    expect(isModalOpen()).toBe(true)
  })

  it('detects an open alert dialog (ConfirmDialog)', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => undefined}
        title="Undo scan #3?"
        confirmLabel="Undo scan"
        onConfirm={() => undefined}
      />,
    )
    expect(isModalOpen()).toBe(true)
  })

  it('detects the ⌘K palette (cmdk-dialog)', () => {
    render(<div cmdk-dialog="" role="dialog" />)
    expect(isModalOpen()).toBe(true)
  })

  it('ignores popovers (role="dialog" inside a popper wrapper) and closed dialogs', () => {
    render(
      <>
        <Popover.Root open>
          <Popover.Trigger>Columns</Popover.Trigger>
          <Popover.Portal>
            <Popover.Content>Column chooser</Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <div role="dialog" data-state="closed" />
      </>,
    )
    expect(screen.getByText('Column chooser')).toBeInTheDocument()
    expect(isModalOpen()).toBe(false)
  })
})

describe('shortcuts pause behind modal dialogs', () => {
  it('a single-key shortcut fires on the page but not while a dialog is open', () => {
    const density = register('d')
    const { rerender } = render(<Dialog open={false} />)
    press('d')
    expect(density).toHaveBeenCalledTimes(1)

    rerender(
      <Dialog open>
        <DialogContent title="Keyboard shortcuts">
          <button type="button">Close sheet</button>
        </DialogContent>
      </Dialog>,
    )
    screen.getByRole('button', { name: 'Close sheet' }).focus()
    press('d')
    press('j')
    expect(density).toHaveBeenCalledTimes(1)

    rerender(<Dialog open={false} />)
    press('d')
    expect(density).toHaveBeenCalledTimes(2)
  })

  it('shortcuts flagged allowInDialog still fire inside dialogs (⌘K, ⌘⏎)', () => {
    const palette = register('mod+k', { allowInInput: true, allowInDialog: true })
    const blocked = register('mod+b')
    render(
      <Dialog open>
        <DialogContent title="Edit">
          <input aria-label="Name" />
        </DialogContent>
      </Dialog>,
    )
    screen.getByLabelText('Name').focus()
    const mod = isMac ? { metaKey: true } : { ctrlKey: true }
    press('k', mod)
    press('b', mod)
    expect(palette).toHaveBeenCalledTimes(1)
    expect(blocked).not.toHaveBeenCalled()
  })

  it('Escape inside a dialog closes the dialog, not the page behind it', () => {
    const closeDrawer = register('escape')
    const onOpenChange = vi.fn()
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent title="Keyboard shortcuts">
          <button type="button">Inside</button>
        </DialogContent>
      </Dialog>,
    )
    screen.getByRole('button', { name: 'Inside' }).focus()
    press('Escape')
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(closeDrawer).not.toHaveBeenCalled()
  })
})
