import { prefsStore } from '@/lib/prefs/store'

/**
 * Scan sound cues (DESIGN.md §10 ScanVerdictBanner) via WebAudio: OK = one short high beep
 * (1320 Hz) · wrong location (and other warnings) = two falling tones (660 → 440 Hz) · unknown
 * serial (and other errors) = long low buzz (196 Hz) · duplicate = soft double tick. The cue is
 * picked by `cueFor()` (verdict.ts). Optional (F2 toggles, persisted per device); meaning never
 * depends on sound.
 */
export type ScanCue = 'ok' | 'warn' | 'error' | 'duplicate'

let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null
  // Headless Chromium crashes pages ("Page crashed") once scan stations have played WebAudio
  // cues, so browser automation (Playwright e2e, screenshots) runs silent. The verdict banner
  // and vibration are unchanged.
  if (navigator.webdriver) return null
  context ??= new window.AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

function tone(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType,
  gain = 0.08,
) {
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = type
  osc.frequency.value = frequency
  const ramp = Math.min(0.01, duration / 4)
  amp.gain.setValueAtTime(0, ctx.currentTime + start)
  amp.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + ramp)
  amp.gain.setValueAtTime(gain, ctx.currentTime + start + duration - ramp)
  amp.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration)
  osc.connect(amp).connect(ctx.destination)
  osc.start(ctx.currentTime + start)
  osc.stop(ctx.currentTime + start + duration + 0.02)
}

export function playCue(cue: ScanCue): void {
  if (!prefsStore.get().sound) return
  const ctx = audio()
  if (!ctx) return
  if (cue === 'ok') tone(ctx, 1320, 0, 0.09, 'sine')
  else if (cue === 'warn') {
    tone(ctx, 660, 0, 0.12, 'triangle')
    tone(ctx, 440, 0.15, 0.16, 'triangle')
  } else if (cue === 'duplicate') {
    tone(ctx, 1760, 0, 0.025, 'sine', 0.04)
    tone(ctx, 1760, 0.09, 0.025, 'sine', 0.04)
  } else tone(ctx, 196, 0, 0.45, 'square', 0.05)
}

/** Vibration on phones (SCREENS.md §10); off with the "Vibration" toggle. */
export function vibrate(pattern: number | number[]): void {
  if (!prefsStore.get().vibration) return
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
}

/** True when the device can vibrate (phones; never iOS Safari). */
export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator
}

/** Sound cues in words (verdict banner "Cue: …"). */
export const CUE_DESCRIPTIONS: Record<ScanCue, string> = {
  ok: 'one short high beep',
  warn: 'two falling tones',
  error: 'long low buzz',
  duplicate: 'soft double tick',
}

/** The legend in the station aside (DESIGN.md §10): verdict word · cue. */
export const CUE_LEGEND: readonly { cue: ScanCue; label: string }[] = [
  { cue: 'ok', label: 'OK' },
  { cue: 'warn', label: 'Wrong location' },
  { cue: 'error', label: 'Unknown serial' },
  { cue: 'duplicate', label: 'Duplicate' },
]
