import { useEffect, useRef } from 'react'
import type { EnumsResponse } from '@/lib/api/types'
import { useEnums } from '@/lib/enums'
import type { ScanEntry } from './scan-list'
import { verdictTitle } from './verdict'

/** What a screen reader hears for a finished scan: title, scanned value, one sentence. */
export function announcementFor(
  enums: EnumsResponse,
  entry: ScanEntry<unknown>,
): { text: string; urgent: boolean } | null {
  if (entry.state === 'failed') {
    return {
      text: `Scan #${entry.sequence} not checked. ${entry.value}. ${entry.error ?? ''}`.trim(),
      urgent: true,
    }
  }
  const result = entry.result
  if (entry.state !== 'done' || !result) return null
  return {
    text: `${verdictTitle(enums, result)}. ${result.scannedValue}. ${result.message}`.trim(),
    urgent: result.verdict !== 'ok',
  }
}

/**
 * Scan verdict live regions (WCAG 4.1.3): two regions mounted for the station's lifetime —
 * polite for OK, assertive for warnings and errors — so every verdict is spoken once, short.
 * The latest entry present at mount is not announced (a reload, a sheet opening). The same
 * text twice (a repeated verdict) is cleared first and set on the next frame.
 */
export function ScanAnnouncer({ latest }: { latest: ScanEntry<unknown> | undefined }) {
  const enums = useEnums()
  const politeRef = useRef<HTMLDivElement>(null)
  const assertiveRef = useRef<HTMLDivElement>(null)
  const key = latest && latest.state !== 'pending' ? `${latest.id}:${latest.state}` : null
  const announced = useRef<string | null | undefined>(undefined)
  const frame = useRef(0)

  useEffect(() => {
    if (announced.current === undefined) {
      announced.current = key // mounted with this entry: not news
      return
    }
    if (!key || key === announced.current || !latest) return
    announced.current = key
    const message = announcementFor(enums, latest)
    const polite = politeRef.current
    const assertive = assertiveRef.current
    if (!message || !polite || !assertive) return
    polite.textContent = ''
    assertive.textContent = ''
    window.cancelAnimationFrame(frame.current)
    frame.current = window.requestAnimationFrame(() => {
      ;(message.urgent ? assertive : polite).textContent = message.text
    })
  }, [key, latest, enums])

  useEffect(() => () => window.cancelAnimationFrame(frame.current), [])

  return (
    <>
      <div
        ref={politeRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <div
        ref={assertiveRef}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />
    </>
  )
}
