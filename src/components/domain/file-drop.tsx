import { Download, FileUp } from 'lucide-react'
import { useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ProgressMeter } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import type { ImportCounts } from '@/lib/api/types'
import { formatBytes, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * FileDrop (DESIGN.md §10): 120 px, dashed line-strong, `file-up` 24 px. Any filename is
 * accepted (the import type is detected from the header row). Drag-over = amber line + wash.
 */
export function FileDrop({
  onFile,
  accept = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  maxBytes,
  label = 'Drop an ITSM export (.csv) here or choose a file',
  hint,
  disabled,
  sample,
  className,
}: {
  onFile: (file: File) => void
  accept?: string
  maxBytes?: number
  label?: ReactNode
  hint?: ReactNode
  disabled?: boolean
  /** "Download sample file" action next to the drop zone. */
  sample?: { label: string; onClick: () => void }
  className?: string
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const take = (file: File | undefined) => {
    if (!file) return
    if (maxBytes && file.size > maxBytes) {
      setError(`${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(maxBytes)}.`)
      return
    }
    setError(null)
    onFile(file)
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          if (!disabled) take(event.dataTransfer.files[0])
        }}
        className={cn(
          'flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-line-strong px-4 py-5 text-center',
          'focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus',
          over && 'border-accent-line bg-accent-wash',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <Icon icon={FileUp} size={24} className="text-fg-3" />
        <span className="text-sm text-fg-2">{label}</span>
        {hint && <span className="text-xs text-fg-3">{hint}</span>}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            take(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </label>
      {error && <p className="text-xs text-tone-critical-fg">{error}</p>}
      {sample && (
        <Button
          variant="link"
          size="sm"
          icon={Download}
          onClick={sample.onClick}
          className="justify-self-start"
        >
          {sample.label}
        </Button>
      )}
    </div>
  )
}

/**
 * ImportProgress (DESIGN.md §10): determinate meter + counts (created · updated · unchanged ·
 * skipped · errors), elapsed time; announced politely. The job keeps running server-side.
 */
export function ImportProgress({
  counts,
  percent,
  elapsed,
  status,
}: {
  counts: ImportCounts
  percent: number | null
  /** "1 min 12 s" */
  elapsed?: string
  status?: ReactNode
}) {
  const total = counts.total ?? 0
  const items: [string, number, string][] = [
    ['created', counts.created, 'text-tone-done-fg'],
    ['updated', counts.updated, 'text-tone-outreach-fg'],
    ['unchanged', counts.unchanged, 'text-fg-2'],
    ['skipped', counts.skipped, 'text-fg-2'],
    ['errors', counts.errors, counts.errors ? 'text-tone-critical-fg' : 'text-fg-2'],
    ['warnings', counts.warnings, counts.warnings ? 'text-tone-caution-fg' : 'text-fg-2'],
  ]
  return (
    <div className="grid gap-2" aria-live="polite">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">
          {status ?? 'Importing'} {formatNumber(counts.processed)}
          {total ? ` / ${formatNumber(total)}` : ''}
        </span>
        <span className="font-mono text-xs text-fg-3">
          {percent !== null ? `${percent.toFixed(0)} %` : ''} {elapsed ? `· ${elapsed}` : ''}
        </span>
      </div>
      <ProgressMeter
        size="station"
        max={100}
        label="Import progress"
        valueText={`${formatNumber(counts.processed)} of ${total ? formatNumber(total) : 'unknown'} rows processed`}
        segments={[{ value: percent ?? 0, tone: 'outreach' }]}
      />
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {items.map(([label, value, cls]) => (
          <div key={label} className="flex gap-1">
            <dt className="text-fg-3">{label}</dt>
            <dd className={cn('font-mono', cls)}>{formatNumber(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
