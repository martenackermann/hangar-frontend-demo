import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { Switch } from '@/components/ui/checkbox'
import { setPrefs, usePrefs } from '@/lib/prefs/store'
import { useShortcutHelp, type ShortcutHelpEntry } from '@/lib/shortcuts'
import { setShortcutsOpen, useShellState } from './command-palette-store'

const GROUP_ORDER = ['Global', 'Navigation', 'Lists', 'Drawer', 'Scan station', 'Page']

/**
 * Shortcut sheet (`?`): every shortcut registered right now, grouped. Single-key shortcuts can
 * be turned off here (WCAG 2.1.4).
 */
export function ShortcutHelp() {
  const { shortcutsOpen } = useShellState()
  const entries = useShortcutHelp()
  const singleKeys = usePrefs((prefs) => prefs.singleKeyShortcuts)
  const groups = new Map<string, ShortcutHelpEntry[]>()
  for (const entry of entries) {
    const list = groups.get(entry.group) ?? []
    list.push(entry)
    groups.set(entry.group, list)
  }
  const ordered = [...groups.entries()].sort(
    ([a], [b]) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99),
  )
  return (
    <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
      <DialogContent
        title="Keyboard shortcuts"
        description="Shortcuts are paused while you type in a field (except Esc and ⌘K)."
        className="w-[min(720px,calc(100vw-24px))]"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {ordered.map(([group, list]) => (
            <section key={group}>
              <h3 className="mb-1.5 text-xs font-semibold text-fg-2">{group}</h3>
              <dl className="grid gap-1">
                {list.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                    <dt className="text-fg-2">{entry.description}</dt>
                    <dd>
                      <Kbd keys={entry.keys} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <div className="mt-5 border-t border-line-subtle pt-3">
          <Switch
            checked={singleKeys}
            onCheckedChange={(checked) => setPrefs({ singleKeyShortcuts: checked })}
            label="Single-key shortcuts (T, D, J, K, G …)"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
