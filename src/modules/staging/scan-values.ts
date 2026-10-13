/** Value detection for the installation place station (SCREENS.md §5.1, SPEC §6.16). */

export const PLACE_PATTERN = /^[A-Z]{1,2}[0-9]{1,2}-[0-9]{1,3}$/

/** Separator of the (serial, place) pair queued as one scan entry. */
export const SCAN_PAIR = ' → '

/** The normalized place when `value` is an installation place (optional `LOC:` prefix), else null. */
export function placeOf(value: string): string | null {
  let cleaned = value.trim().toUpperCase()
  if (cleaned.startsWith('LOC:')) cleaned = cleaned.slice(4).trim()
  return PLACE_PATTERN.test(cleaned) ? cleaned : null
}
