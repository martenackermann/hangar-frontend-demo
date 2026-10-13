import { Camera, CameraOff, X } from 'lucide-react'
import { Dialog as RadixDialog } from 'radix-ui'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/icon'
import { useEnums } from '@/lib/enums'
import { createCodeDetector, DEFAULT_SCAN_FORMATS } from '@/lib/scan/barcode'
import { cn } from '@/lib/utils'
import { ScanAnnouncer } from './scan-announcer'
import { normalizeScan } from './scan-input'
import type { ScanEntry } from './scan-list'
import { VERDICT_STYLES, verdictIcon, verdictTitle } from './verdict'

/** Same code again within this window is ignored (SCREENS.md §10 camera mode). */
const CAMERA_DEBOUNCE_MS = 1200

/**
 * Full-screen camera sheet (SCREENS.md §10): rear camera, continuous detection, viewfinder
 * overlay that flashes in each new verdict's tone, and the latest verdict in words (icon +
 * title + serial) with its own live region — the station behind the sheet is hidden from
 * screen readers while it is open. Uses the native BarcodeDetector where it exists, otherwise
 * the self-hosted zxing-wasm ponyfill. Needs HTTPS or localhost.
 */
export function CameraScanner({
  open,
  onOpenChange,
  onDetected,
  latest,
  title = 'Camera scan',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDetected: (value: string) => void
  /** The station's latest scan (verdict feedback inside the sheet). */
  latest?: ScanEntry<unknown> | undefined
  title?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  // Reset the error when the sheet opens again (state adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setError(null)
  }
  const onDetectedRef = useRef(onDetected)
  useEffect(() => {
    onDetectedRef.current = onDetected
  })

  useEffect(() => {
    if (!open) return
    let stream: MediaStream | null = null
    let cancelled = false
    let frame = 0
    let last: { value: string; at: number } | null = null

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error('This browser cannot open the camera.')
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        const video = videoRef.current
        if (!video || cancelled) return
        video.srcObject = stream
        await video.play()
        const detector = await createCodeDetector(DEFAULT_SCAN_FORMATS)
        const tick = async () => {
          if (cancelled) return
          try {
            if (video.readyState >= 2) {
              const codes = await detector.detect(video)
              const raw = codes[0]?.rawValue
              if (raw) {
                const value = normalizeScan(raw)
                const now = Date.now()
                if (last?.value !== value || now - last.at > CAMERA_DEBOUNCE_MS) {
                  last = { value, at: now }
                  onDetectedRef.current(value)
                }
              }
            }
          } catch {
            // transient decode errors: keep scanning
          }
          frame = window.setTimeout(() => void tick(), 120)
        }
        void tick()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The camera could not be started.')
      }
    }
    void start()
    return () => {
      cancelled = true
      window.clearTimeout(frame)
      for (const track of stream?.getTracks() ?? []) track.stop()
    }
  }, [open])

  const result = latest?.state === 'done' ? latest.result : undefined
  const failed = latest?.state === 'failed'
  const tone = result ? VERDICT_STYLES[result.verdict].tone : failed ? 'critical' : null

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Content className="fixed inset-0 z-[60] flex flex-col bg-black text-white outline-none">
          <div className="flex h-14 shrink-0 items-center justify-between px-4">
            <RadixDialog.Title className="flex items-center gap-2 text-lg font-semibold">
              <Icon icon={Camera} size={20} /> {title}
            </RadixDialog.Title>
            <RadixDialog.Description className="sr-only">
              Point the rear camera at a barcode or QR code. Detected codes are submitted
              automatically.
            </RadixDialog.Description>
            <RadixDialog.Close
              aria-label="Close camera"
              className="grid size-12 place-items-center rounded-md hover:bg-white/10"
            >
              <Icon icon={X} size={20} />
            </RadixDialog.Close>
          </div>
          <div className="relative min-h-0 flex-1">
            {error ? (
              <div className="grid h-full place-items-center p-6 text-center">
                <div className="grid justify-items-center gap-3">
                  <Icon icon={CameraOff} size={32} />
                  <p>{error}</p>
                  <p className="text-sm text-white/70">
                    Type the serial into the scan field instead.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
                <div
                  aria-hidden
                  // keyed on the scan, so the same verdict twice still flashes
                  key={latest?.id ?? 'none'}
                  className={cn(
                    'pointer-events-none absolute inset-x-[10%] top-1/2 h-40 -translate-y-1/2 rounded-lg border-4',
                    tone ? `hg-tone-${tone} animate-verdict border-(--t)` : 'border-accent',
                  )}
                />
              </>
            )}
          </div>
          {latest && (result ?? failed) && <CameraVerdict entry={latest} />}
          <ScanAnnouncer latest={latest} />
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

/** The latest verdict in the sheet: tone tile + icon, title and the scanned value. */
function CameraVerdict({ entry }: { entry: ScanEntry<unknown> }) {
  const enums = useEnums()
  const result = entry.result
  const style = result ? VERDICT_STYLES[result.verdict] : VERDICT_STYLES.error
  const icon = result ? verdictIcon(result.verdict, result.code) : style.icon
  const title = result ? verdictTitle(enums, result) : `Scan #${entry.sequence} not checked`
  return (
    <div className="shrink-0 px-3 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
      <div
        key={entry.id}
        className={`hg-tone-${style.tone} flex animate-verdict items-center gap-3 rounded-md border border-[color-mix(in_srgb,var(--t)_45%,transparent)] bg-(--t-wash) p-3 text-fg`}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-(--t)">
          <Icon icon={icon} size={24} className="text-[var(--hg-fg-inverse)]" />
        </span>
        <span className="grid min-w-0">
          <span className="truncate text-xl font-[650] text-(--t-fg)">{title}</span>
          <span className="truncate font-mono text-md font-semibold tracking-[0.04em]">
            {result?.scannedValue ?? entry.value}
          </span>
        </span>
      </div>
    </div>
  )
}
