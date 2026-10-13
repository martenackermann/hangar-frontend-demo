import { createStore, useSelector } from '@tanstack/react-store'

/** Open state of the ⌘K palette and the `?` shortcut sheet (shared by shell, pages, 404). */
export const shellStore = createStore({
  paletteOpen: false,
  shortcutsOpen: false,
  navSheetOpen: false,
})

export function openCommandPalette(): void {
  shellStore.setState((s) => ({ ...s, paletteOpen: true }))
}

export function setPaletteOpen(open: boolean): void {
  shellStore.setState((s) => ({ ...s, paletteOpen: open }))
}

export function setShortcutsOpen(open: boolean): void {
  shellStore.setState((s) => ({ ...s, shortcutsOpen: open }))
}

export function setNavSheetOpen(open: boolean): void {
  shellStore.setState((s) => ({ ...s, navSheetOpen: open }))
}

export function useShellState() {
  return useSelector(shellStore)
}

// ---- recent entities (⌘K "Recent", SCREENS.md §1.3) -------------------------------------------

export interface RecentEntity {
  kind: 'service_request' | 'lease_return' | 'asset' | 'contact'
  id: number
  title: string
  subtitle?: string
  href: string
}

const RECENT_KEY = 'hangar.recent.v1'

export function readRecent(userId: number | undefined): RecentEntity[] {
  try {
    const raw = globalThis.localStorage?.getItem(`${RECENT_KEY}.${userId ?? 0}`)
    return raw ? (JSON.parse(raw) as RecentEntity[]) : []
  } catch {
    return []
  }
}

/** Remember an opened entity (drawers call this); keeps the last 8. */
export function pushRecent(userId: number | undefined, entity: RecentEntity): void {
  try {
    const list = readRecent(userId).filter((e) => !(e.kind === entity.kind && e.id === entity.id))
    globalThis.localStorage?.setItem(
      `${RECENT_KEY}.${userId ?? 0}`,
      JSON.stringify([entity, ...list].slice(0, 8)),
    )
  } catch {
    // ignore
  }
}
