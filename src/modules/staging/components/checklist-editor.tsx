import { useQuery } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { ProgressMeter, Skeleton, ToneBadge } from '@/components/ui/feedback'
import type { SoftwareChecklist } from '@/lib/api/types'
import { stagingQueries, usePutChecklist } from '@/modules/staging/api'
import { SoftwareTags } from './software-tags'

/** "2/3" software progress with done tone when complete (order closing table). */
export function ChecklistProgress({ checklist }: { checklist: SoftwareChecklist }) {
  const done = checklist.required.length - checklist.missing.length
  if (checklist.required.length === 0) return <span className="text-fg-3">None</span>
  return (
    <span className="inline-flex items-center gap-2">
      <ProgressMeter
        segments={[{ value: done, tone: checklist.complete ? 'done' : 'caution' }]}
        max={checklist.required.length}
        label="Software installed"
        valueText={`${done} of ${checklist.required.length}`}
        className="w-12"
      />
      {checklist.complete ? (
        <ToneBadge tone="done" icon={CheckCircle2}>
          {done}/{checklist.required.length}
        </ToneBadge>
      ) : (
        <span className="hg-mono text-fg-2">
          {done}/{checklist.required.length}
        </span>
      )}
    </span>
  )
}

/**
 * Software checklist (SPEC §6.15): one checkbox per required item (requested + added), an
 * "Add software" input; changes are saved with `PUT …/software-checklist`, debounced 500 ms.
 */
export function ChecklistEditor({ srId, editable }: { srId: number; editable: boolean }) {
  const query = useQuery(stagingQueries.checklist(srId))
  const save = usePutChecklist(srId)
  const [draft, setDraft] = useState<{ installed: string[]; added: string[] } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const saveRef = useRef(save.mutate)
  useEffect(() => {
    saveRef.current = save.mutate
  })
  useEffect(() => () => window.clearTimeout(timer.current), [])

  if (query.isPending) return <Skeleton className="h-20 w-full" />
  if (query.isError || !query.data)
    return <p className="text-sm text-fg-3">Checklist unavailable.</p>
  const server = query.data
  const installed = draft?.installed ?? server.installed
  const added = draft?.added ?? server.added
  const required = dedupe([
    ...server.required.filter(
      (name) =>
        !server.added.some((a) => a.toLowerCase() === name.toLowerCase()) ||
        added.some((a) => a.toLowerCase() === name.toLowerCase()),
    ),
    ...added,
  ])
  const isChecked = (name: string) => installed.some((i) => i.toLowerCase() === name.toLowerCase())
  const missing = required.filter((name) => !isChecked(name))

  const schedule = (next: { installed: string[]; added: string[] }) => {
    setDraft(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      saveRef.current(
        { installedSoftware: next.installed, addedSoftware: next.added },
        { onSettled: () => setDraft(null) },
      )
    }, 500)
  }

  return (
    <div className="grid gap-3" data-testid="software-checklist">
      {required.length === 0 ? (
        <p className="text-sm text-fg-2">No software requested. The checklist is complete.</p>
      ) : (
        <ul className="grid gap-1.5" aria-label="Software checklist">
          {required.map((name) => {
            const id = `sw-${srId}-${name.replace(/\W+/g, '-')}`
            return (
              <li key={name} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={isChecked(name)}
                  disabled={!editable}
                  onCheckedChange={(checked) =>
                    schedule({
                      added,
                      installed: checked
                        ? [...installed, name]
                        : installed.filter((i) => i.toLowerCase() !== name.toLowerCase()),
                    })
                  }
                />
                <label htmlFor={id} className="text-sm">
                  {name}
                </label>
                {server.added.some((a) => a.toLowerCase() === name.toLowerCase()) && (
                  <span className="text-xs text-fg-3">added</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {editable && (
        <SoftwareTags
          label="Add software"
          value={added}
          onChange={(next) => schedule({ installed, added: next })}
        />
      )}
      <p className="text-xs text-fg-3" aria-live="polite">
        {save.isPending || draft
          ? 'Saving…'
          : missing.length === 0
            ? 'All software installed.'
            : `${missing.length} item${missing.length === 1 ? '' : 's'} still to install.`}
      </p>
    </div>
  )
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = value.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
