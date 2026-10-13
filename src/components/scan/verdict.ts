import {
  Check,
  Copy,
  MapPinOff,
  CircleHelp,
  OctagonX,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { ScanVerdict, Tone } from '@/lib/api/types'

/**
 * The one verdict table (SPEC_RESOLUTIONS #25): banner tone, sound, vibration and default icon
 * are chosen by the verdict only. The scan `code` only selects the title word and, for a few
 * codes, a more specific icon.
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
  unknown_device: CircleHelp,
  duplicate: Copy,
}

export function verdictIcon(verdict: ScanVerdict, code: string | undefined): LucideIcon {
  return (code ? CODE_ICONS[code] : undefined) ?? VERDICT_STYLES[verdict].icon
}
