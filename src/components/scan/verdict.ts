import {
  Check,
  Copy,
  MapPinOff,
  CircleHelp,
  OctagonX,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { EnumsResponse, ScanResult, ScanVerdict, Tone } from '@/lib/api/types'
import { findEnumValue } from '@/lib/enums'
import type { ScanCue } from './sound'

/**
 * The one verdict table (SPEC_RESOLUTIONS #25): banner tone, vibration and default icon and
 * sound are chosen by the verdict. The scan `code` only selects the title word and, for a few
 * codes, a more specific icon and cue (DESIGN.md §10: unknown serial buzzes, duplicate ticks).
 */
export interface VerdictStyle {
  tone: Tone
  sound: 'ok' | 'warn' | 'error'
  /** Vibration pattern on phones (SCREENS.md §10). */
  vibrate: number | number[]
  icon: LucideIcon
  /** Spoken/visible fallback title when the code has no label. */
  title: string
}

export const VERDICT_STYLES: Record<ScanVerdict, VerdictStyle> = {
  ok: { tone: 'done', sound: 'ok', vibrate: 40, icon: Check, title: 'OK' },
  warning: {
    tone: 'caution',
    sound: 'warn',
    vibrate: [40, 60, 40],
    icon: TriangleAlert,
    title: 'Check this',
  },
  error: { tone: 'critical', sound: 'error', vibrate: 250, icon: OctagonX, title: 'Not accepted' },
}

/** Code-specific icons (DESIGN.md §3.4); everything else uses the verdict icon. */
const CODE_ICONS: Record<string, LucideIcon> = {
  wrong_location: MapPinOff,
  wrong_zone: MapPinOff,
  wrong_site: MapPinOff,
  unknown_serial: CircleHelp,
  unknown_recorded: CircleHelp,
  unknown_device: CircleHelp,
  duplicate: Copy,
}

/** Code-specific cues (DESIGN.md §10 sound cues); everything else uses the verdict's sound. */
const CODE_CUES: Record<string, ScanCue> = {
  wrong_location: 'warn',
  wrong_zone: 'warn',
  wrong_site: 'warn',
  unknown_serial: 'error',
  unknown_recorded: 'error',
  unknown_device: 'error',
  duplicate: 'duplicate',
}

export function verdictIcon(verdict: ScanVerdict, code: string | undefined): LucideIcon {
  return (code ? CODE_ICONS[code] : undefined) ?? VERDICT_STYLES[verdict].icon
}

export function cueFor(verdict: ScanVerdict, code: string | undefined): ScanCue {
  return (code ? CODE_CUES[code] : undefined) ?? VERDICT_STYLES[verdict].sound
}

/** Title word of a result: the scan code's label ("Wrong location"), else the verdict's. */
export function verdictTitle(enums: EnumsResponse, result: Pick<ScanResult, 'verdict' | 'code'>) {
  return (
    findEnumValue(enums, 'scanCode', result.code)?.label ?? VERDICT_STYLES[result.verdict].title
  )
}
