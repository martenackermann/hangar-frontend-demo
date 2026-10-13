import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ScanResult } from '@/lib/api/types'
import { renderWithProviders } from '@/test/utils'
import { normalizeScan, ScanInput } from './scan-input'
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
