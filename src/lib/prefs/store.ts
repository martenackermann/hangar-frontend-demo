import { createStore, useSelector } from '@tanstack/react-store'

/**
 * Per-device UI preferences (DESIGN.md §15 "useUiPrefs"): theme, density, rail, scan sound and
 * vibration, single-key shortcuts. Persisted in localStorage; theme and density are written to
 * <html data-theme / data-density>. index.html applies them before first paint.
 */
export type Theme = 'dark' | 'light' | 'system'
export type Density = 'compact' | 'comfortable'

export interface UiPrefs {
  theme: Theme
  density: Density
  /** `null` = automatic (collapsed below 1440 px). */
  railCollapsed: boolean | null
  /** Scan station sound cues (F2). */
  sound: boolean
  /** Scan station vibration on phones (SCREENS.md §10). */
  vibration: boolean
  /** Single-key shortcuts (WCAG 2.1.4 lets users turn them off). */
  singleKeyShortcuts: boolean
}

export const PREFS_STORAGE_KEY = 'hangar.prefs.v1'

const DEFAULTS: UiPrefs = {
  theme: 'dark',
  density: 'compact',
  railCollapsed: null,
  sound: true,
  vibration: true,
  singleKeyShortcuts: true,
}

function isPhone(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
}

function readPrefs(): UiPrefs {
  try {
    const raw = globalThis.localStorage?.getItem(PREFS_STORAGE_KEY)
    const stored = raw ? (JSON.parse(raw) as Partial<UiPrefs>) : {}
    // Phones follow the OS theme unless the user picked one (DESIGN.md §9.4).
    const theme = stored.theme ?? (isPhone() ? 'system' : DEFAULTS.theme)
    return { ...DEFAULTS, ...stored, theme }
  } catch {
    return DEFAULTS
  }
}

export const prefsStore = createStore<UiPrefs>(readPrefs())

const THEME_COLORS = { dark: '#0f1215', light: '#edeff2' } as const

export function applyPrefsToDocument(prefs: UiPrefs): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = prefs.theme
  root.dataset.density = prefs.density
  const resolved =
    prefs.theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : prefs.theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[resolved])
}

prefsStore.subscribe((prefs) => {
  applyPrefsToDocument(prefs)
  try {
    globalThis.localStorage?.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore (private mode)
  }
})

export function setPrefs(patch: Partial<UiPrefs>): void {
  prefsStore.setState((prev) => ({ ...prev, ...patch }))
}

/** Dark ↔ light (system resolves to the opposite of what is shown now). */
export function toggleTheme(): void {
  const { theme } = prefsStore.get()
  const showingLight =
    theme === 'light' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches)
  setPrefs({ theme: showingLight ? 'dark' : 'light' })
}

export function toggleDensity(): void {
  setPrefs({ density: prefsStore.get().density === 'compact' ? 'comfortable' : 'compact' })
}

export function usePrefs(): UiPrefs
export function usePrefs<T>(select: (prefs: UiPrefs) => T): T
export function usePrefs<T>(select?: (prefs: UiPrefs) => T): T | UiPrefs {
  return useSelector(
    prefsStore,
    (select ?? ((prefs: UiPrefs) => prefs)) as (prefs: UiPrefs) => T | UiPrefs,
  )
}
