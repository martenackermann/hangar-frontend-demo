import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'

/** Tag input for added software (SPEC §6.15): Enter adds, × removes; case-insensitive dedupe. */
export function SoftwareTags({
  value,
  onChange,
  disabled,
  label = 'Add software',
}: {
  value: readonly string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  label?: string
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const name = draft.trim()
    if (!name) return
    if (!value.some((v) => v.toLowerCase() === name.toLowerCase())) onChange([...value, name])
    setDraft('')
  }
  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Added software">
          {value.map((name) => (
            <li
              key={name}
              className="inline-flex h-badge items-center gap-1 rounded-xs bg-pressed pr-0.5 pl-1.5 text-xs"
            >
              {name}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  onClick={() => onChange(value.filter((v) => v !== name))}
                  className="grid size-4 place-items-center rounded-2xs text-fg-3 hover:bg-hover hover:text-fg"
                >
                  <Icon icon={X} size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="flex gap-2">
          <Input
            value={draft}
            maxLength={120}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                add()
              }
            }}
            placeholder="e.g. Diagram Tool"
            aria-label={label}
          />
          <Button icon={Plus} onClick={add} disabled={!draft.trim()}>
            Add
          </Button>
        </div>
      )}
    </div>
  )
}
