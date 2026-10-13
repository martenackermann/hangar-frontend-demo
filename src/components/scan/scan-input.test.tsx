import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ScanResult } from '@/lib/api/types'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { renderWithProviders } from '@/test/utils'
import { normalizeScan, REFOCUS_MS, ScanInput, shouldRefocus } from './scan-input'
import { MAX_QUEUE, useScanSession } from './use-scan-session'
import { VERDICT_STYLES } from './verdict'

function result(value: string, verdict: ScanResult['verdict'] = 'ok'): ScanResult {
  return {
    verdict,
    code: verdict === 'ok' ? 'matched' : 'unknown_serial',
    message: verdict === 'ok' ? 'Counted.' : 'Unknown serial.',
    scannedValue: value,
    applied: verdict === 'ok',
    entity: null,
    undo: null,
    progress: null,
    canRegister: false,
    suggestedSlots: [],
  }
}

describe('ScanInput (DESIGN.md §10, SCREENS.md §10)', () => {
  it('submits the trimmed, upper-cased value on Enter and clears the field', async () => {
    const onSubmit = vi.fn()
    renderWithProviders(<ScanInput label="Scan serial" onSubmit={onSubmit} />)
    const input = screen.getByLabelText('Scan serial')
    expect(input).toHaveFocus() // focus lock grabs focus on mount
    await userEvent.type(input, '  kd7f3k21q9 {Enter}')
    expect(onSubmit).toHaveBeenCalledWith('KD7F3K21Q9')
    expect(input).toHaveValue('')
  })

  it('treats the same value within 800 ms as a scanner bounce', async () => {
    const onSubmit = vi.fn()
    renderWithProviders(<ScanInput label="Scan serial" onSubmit={onSubmit} />)
    const input = screen.getByLabelText('Scan serial')
    await userEvent.type(input, 'ABC123{Enter}ABC123{Enter}XYZ{Enter}')
    expect(onSubmit.mock.calls).toEqual([['ABC123'], ['XYZ']])
  })

  it('Esc clears the value; Esc Esc releases the focus lock', async () => {
    renderWithProviders(<ScanInput label="Scan serial" onSubmit={vi.fn()} />)
    const input = screen.getByLabelText('Scan serial')
    await userEvent.type(input, 'ABC{Escape}')
    expect(input).toHaveValue('')
    await userEvent.keyboard('{Escape}{Escape}')
    expect(input).not.toHaveFocus()
    expect(screen.getByText(/Focus released · press Enter/)).toBeInTheDocument()
  })

  it('normalizes scans', () => {
    expect(normalizeScan('  gx104233 ')).toBe('GX104233')
  })
})

describe('useScanSession', () => {
  it('sends one request per scan in FIFO order and counts verdicts', async () => {
    const calls: string[] = []
    const submit = vi.fn(async (value: string) => {
      calls.push(value)
      await new Promise((resolve) => setTimeout(resolve, 5))
      return result(value, value.startsWith('X') ? 'error' : 'ok')
    })
    const { result: session } = renderHook(() => useScanSession({ submit }))
    act(() => {
      session.current.scan('A1')
      session.current.scan('X2')
      session.current.scan('A3')
    })
    expect(session.current.pending).toBe(3)
    await waitFor(() => expect(session.current.pending).toBe(0))
    expect(calls).toEqual(['A1', 'X2', 'A3'])
    expect(session.current.entries.map((e) => e.value)).toEqual(['A3', 'X2', 'A1']) // newest first
    expect(session.current.counters).toEqual({ ok: 2, warning: 0, error: 1 })
    expect(session.current.latest?.value).toBe('A3')
  })

  it('caps the queue at 20 pending scans', () => {
    const submit = vi.fn(() => new Promise<ScanResult>(() => undefined))
    const { result: session } = renderHook(() => useScanSession({ submit }))
    act(() => {
      for (let i = 0; i < MAX_QUEUE + 5; i++) session.current.scan(`S${i}`)
    })
    // one in flight + 20 queued
    expect(session.current.pending).toBe(MAX_QUEUE + 1)
  })

  it('maps verdicts to one tone/sound table (SPEC_RESOLUTIONS #25)', () => {
    expect(VERDICT_STYLES.ok).toMatchObject({ tone: 'done', sound: 'ok' })
    expect(VERDICT_STYLES.warning).toMatchObject({ tone: 'caution', sound: 'warn' })
    expect(VERDICT_STYLES.error).toMatchObject({ tone: 'critical', sound: 'error' })
  })
})

const settle = () => new Promise((resolve) => setTimeout(resolve, REFOCUS_MS + 150))

describe('shouldRefocus (A11Y B1: no keyboard trap)', () => {
  const input = document.createElement('input')
  const button = document.createElement('button')
  const other = document.createElement('textarea')
  const base = {
    locked: true,
    disabled: false,
    input,
    active: document.body as Element | null,
    overlay: false,
    afterOverlay: false,
  }

  it('takes focus back only when it was lost to the page', () => {
    expect(shouldRefocus(base)).toBe(true)
    expect(shouldRefocus({ ...base, active: null })).toBe(true)
    expect(shouldRefocus({ ...base, active: button })).toBe(false)
    expect(shouldRefocus({ ...base, active: other })).toBe(false)
  })

  it('never while released, disabled, or with an overlay open', () => {
    expect(shouldRefocus({ ...base, locked: false })).toBe(false)
    expect(shouldRefocus({ ...base, disabled: true })).toBe(false)
    expect(shouldRefocus({ ...base, overlay: true })).toBe(false)
  })

  it('after a dialog closes it takes focus back from the trigger, not from a field', () => {
    expect(shouldRefocus({ ...base, active: button, afterOverlay: true })).toBe(true)
    expect(shouldRefocus({ ...base, active: other, afterOverlay: true })).toBe(false)
  })
})

describe('ScanInput focus lock (A11Y B1)', () => {
  it('Tab moves focus out, releases the lock and focus stays out', async () => {
    renderWithProviders(
      <>
        <ScanInput label="Scan serial" onSubmit={vi.fn()} />
        <button type="button">Flagged</button>
      </>,
    )
    const input = screen.getByLabelText('Scan serial')
    expect(input).toHaveFocus()
    expect(screen.getByText('Focus locked · Esc Esc to release')).toBeInTheDocument()
    await userEvent.tab()
    const flagged = screen.getByRole('button', { name: 'Flagged' })
    expect(flagged).toHaveFocus()
    await settle()
    expect(flagged).toHaveFocus()
    expect(screen.getByTestId('scan-lock-state')).toHaveTextContent(/^Focus released/)
  })

  it('Esc Esc releases until Enter or a click on the field locks again', async () => {
    renderWithProviders(<ScanInput label="Scan serial" onSubmit={vi.fn()} />)
    const input = screen.getByLabelText('Scan serial')
    await userEvent.keyboard('{Escape}{Escape}')
    await settle()
    expect(input).not.toHaveFocus()
    // keyboard focus alone doesn't lock again
    act(() => input.focus())
    expect(screen.getByTestId('scan-lock-state')).toHaveTextContent(/^Focus released/)
    await userEvent.keyboard('{Enter}')
    expect(screen.getByText('Focus locked · Esc Esc to release')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}{Escape}')
    expect(screen.getByTestId('scan-lock-state')).toHaveTextContent(/^Focus released/)
    await userEvent.click(input)
    expect(input).toHaveFocus()
    expect(screen.getByText('Focus locked · Esc Esc to release')).toBeInTheDocument()
  })

  it('takes the focus back when it is lost to the page, never from another field', async () => {
    renderWithProviders(
      <>
        <ScanInput label="Scan serial" onSubmit={vi.fn()} />
        <input aria-label="Note" />
      </>,
    )
    const input = screen.getByLabelText('Scan serial')
    act(() => input.blur())
    expect(document.activeElement).toBe(document.body)
    await settle()
    expect(input).toHaveFocus()

    const note = screen.getByLabelText('Note')
    act(() => note.focus())
    await settle()
    expect(note).toHaveFocus()
  })

  it('leaves an open dialog alone and locks again once it closes', async () => {
    function Station({ open }: { open: boolean }) {
      return (
        <>
          <ScanInput label="Scan serial" onSubmit={vi.fn()} />
          <button type="button">Finish &amp; verify</button>
          <Dialog open={open}>
            <DialogContent title="Close inventory Hillford Hub?">
              <input aria-label="Count date" />
            </DialogContent>
          </Dialog>
        </>
      )
    }
    const { rerender } = renderWithProviders(<Station open={false} />)
    const input = screen.getByLabelText('Scan serial')
    // a pointer click moves focus to the trigger, which opens the dialog
    act(() => screen.getByRole('button', { name: 'Finish & verify' }).focus())
    rerender(<Station open />)
    const date = await screen.findByLabelText('Count date')
    await waitFor(() => expect(date).toHaveFocus())
    await settle()
    expect(date).toHaveFocus()
    expect(input).not.toHaveFocus()

    rerender(<Station open={false} />)
    await waitFor(() => expect(input).toHaveFocus(), { timeout: 2000 })
    expect(screen.getByText('Focus locked · Esc Esc to release')).toBeInTheDocument()
  })

  it('reports scan mode (lock on and focused) for the session bar', async () => {
    const onActiveChange = vi.fn()
    renderWithProviders(
      <ScanInput label="Scan serial" onSubmit={vi.fn()} onActiveChange={onActiveChange} />,
    )
    await waitFor(() => expect(onActiveChange).toHaveBeenLastCalledWith(true))
    await userEvent.keyboard('{Escape}{Escape}')
    await waitFor(() => expect(onActiveChange).toHaveBeenLastCalledWith(false))
  })
})
