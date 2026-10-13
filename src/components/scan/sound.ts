import { prefsStore } from '@/lib/prefs/store'

/**
 * Scan sound cues (DESIGN.md §10 ScanVerdictBanner) via WebAudio: OK = one short high beep
 * (1320 Hz) · warning = two falling tones (660 → 440 Hz) · error = long low buzz (196 Hz).
 * Optional (F2 toggles, persisted per device); meaning never depends on sound.
 */
let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null
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
  amp.gain.setValueAtTime(0, ctx.currentTime + start)
  amp.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01)
  amp.gain.setValueAtTime(gain, ctx.currentTime + start + duration - 0.02)
  amp.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration)
  osc.connect(amp).connect(ctx.destination)
  osc.start(ctx.currentTime + start)
  osc.stop(ctx.currentTime + start + duration + 0.02)
}

export function playCue(cue: 'ok' | 'warn' | 'error'): void {
  if (!prefsStore.get().sound) return
  const ctx = audio()
  if (!ctx) return
  if (cue === 'ok') tone(ctx, 1320, 0, 0.09, 'sine')
  else if (cue === 'warn') {
    tone(ctx, 660, 0, 0.12, 'triangle')
    tone(ctx, 440, 0.15, 0.16, 'triangle')
  } else tone(ctx, 196, 0, 0.45, 'square', 0.05)
}

export function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
}

/** Sound cue descriptions for the help aside. */
export const CUE_DESCRIPTIONS = {
  ok: 'one short high beep',
  warn: 'two falling tones',
  error: 'long low buzz',
} as const
