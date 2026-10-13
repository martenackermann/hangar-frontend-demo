import { useCallback, useEffect, useRef, useState } from 'react'
import { notify } from '@/components/ui/toast'
import { api } from '@/lib/api/client'
import { isApiError } from '@/lib/api/errors'
import type { ScanResult } from '@/lib/api/types'
import type { ScanEntry } from './scan-list'
import { playCue, vibrate } from './sound'
import { VERDICT_STYLES } from './verdict'

/** Max queued scans while a request is in flight (SCREENS.md §10). */
export const MAX_QUEUE = 20

export interface ScanSessionOptions<T> {
  /** One API request per scan; resolves with the verdict (business misses are verdicts). */
  submit: (value: string) => Promise<ScanResult<T>>
  onResult?: (result: ScanResult<T>, entry: ScanEntry<T>) => void
  onUndone?: (entry: ScanEntry<T>) => void
  /** Entries loaded from the server (inventory: all users' recent scans). */
  initialEntries?: ScanEntry<T>[]
}

export interface ScanSession<T> {
  entries: ScanEntry<T>[]
  /** Latest finished entry (drives the verdict banner). */
  latest: ScanEntry<T> | undefined
  pending: number
  scan: (value: string) => void
  undo: (entry: ScanEntry<T>) => Promise<void>
  undoLast: () => void
  undoingId: string | null
  counters: { ok: number; warning: number; error: number }
}

let nextEntryId = 1

/**
 * Scan session state machine: FIFO queue (max 20), exactly one request per scan, verdict sound
 * + vibration, undo via the result's `undo` link (409 `undo_not_possible` → toast).
 */
export function useScanSession<T = unknown>({
  submit,
  onResult,
  onUndone,
  initialEntries,
}: ScanSessionOptions<T>): ScanSession<T> {
  const [entries, setEntries] = useState<ScanEntry<T>[]>(initialEntries ?? [])
  const [undoingId, setUndoingId] = useState<string | null>(null)
  const queue = useRef<ScanEntry<T>[]>([])
  const busy = useRef(false)
  const sequence = useRef(initialEntries?.length ?? 0)
  const submitRef = useRef(submit)
  const onResultRef = useRef(onResult)
  useEffect(() => {
    submitRef.current = submit
    onResultRef.current = onResult
  })

  const update = useCallback((id: string, patch: Partial<ScanEntry<T>>) => {
    setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))
  }, [])

  const pump = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      while (queue.current.length > 0) {
        const entry = queue.current.shift()
        if (!entry) break
        try {
          const result = await submitRef.current(entry.value)
          const style = VERDICT_STYLES[result.verdict]
          playCue(style.sound)
          vibrate(style.vibrate)
          const done: ScanEntry<T> = { ...entry, state: 'done', result }
          update(entry.id, { state: 'done', result })
          onResultRef.current?.(result, done)
        } catch (error) {
          playCue('error')
          vibrate(VERDICT_STYLES.error.vibrate)
          const message = isApiError(error)
            ? (error.detail ?? error.title)
            : 'The scan could not be sent.'
          update(entry.id, { state: 'failed', error: message })
        }
      }
    } finally {
      busy.current = false
    }
  }, [update])

  const scan = useCallback(
    (value: string) => {
      if (queue.current.length >= MAX_QUEUE) {
        notify.warning('Scanner queue is full', {
          description: `Wait until the ${MAX_QUEUE} pending scans are checked.`,
        })
        return
      }
      sequence.current += 1
      const entry: ScanEntry<T> = {
        id: `scan-${nextEntryId++}`,
        sequence: sequence.current,
        at: new Date(),
        value,
        state: 'pending',
      }
      setEntries((prev) => [entry, ...prev])
      queue.current.push(entry)
      void pump()
    },
    [pump],
  )

  const undo = useCallback(
    async (entry: ScanEntry<T>) => {
      const link = entry.result?.undo
      if (!link || entry.undone) return
      setUndoingId(entry.id)
      try {
        if (link.method === 'DELETE') await api.delete(link.href)
        else await api.post(link.href, link.body ?? {})
        update(entry.id, { undone: true })
        notify.success(`Scan #${entry.sequence} undone`, { description: entry.value })
        onUndone?.(entry)
      } catch (error) {
        notify.error(isApiError(error) ? error.title : 'Undo failed', {
          description: isApiError(error) ? error.detail : undefined,
        })
      } finally {
        setUndoingId(null)
      }
    },
    [onUndone, update],
  )

  const undoLast = useCallback(() => {
    const target = entries.find(
      (entry) => entry.result?.undo && entry.result.applied && !entry.undone,
    )
    if (target) void undo(target)
  }, [entries, undo])

  const counters = { ok: 0, warning: 0, error: 0 }
  for (const entry of entries) {
    if (entry.undone) continue
    if (entry.result) counters[entry.result.verdict]++
    else if (entry.state === 'failed') counters.error++
  }

  return {
    entries,
    latest: entries.find((entry) => entry.state !== 'pending'),
    pending: entries.filter((entry) => entry.state === 'pending').length,
    scan,
    undo,
    undoLast,
    undoingId,
    counters,
  }
}
