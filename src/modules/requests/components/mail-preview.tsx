import { useState } from 'react'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { cn } from '@/lib/utils'

/**
 * Rendered mail body: HTML in a sandboxed `iframe srcdoc` (API.md §4.8 — no scripts, no
 * same-origin) with a text-version toggle.
 */
export function MailBody({
  html,
  text,
  title,
  className,
  height = 420,
}: {
  html: string | null
  text: string | null
  title: string
  className?: string
  height?: number
}) {
  const [mode, setMode] = useState<'html' | 'text'>(html ? 'html' : 'text')
  return (
    <div className={cn('grid gap-2', className)}>
      <SegmentedControl
        label="Mail format"
        value={mode}
        onValueChange={setMode}
        options={[
          { value: 'html', label: 'Rendered' },
          { value: 'text', label: 'Text' },
        ]}
        className="justify-self-start"
      />
      {mode === 'html' && html ? (
        <iframe
          title={title}
          sandbox=""
          srcDoc={html}
          className="w-full rounded-sm border border-line bg-white"
          style={{ height }}
        />
      ) : (
        <pre className="max-h-[480px] overflow-auto rounded-sm border border-line bg-sunken p-3 font-mono text-xs whitespace-pre-wrap text-fg-2">
          {text ?? 'No text version stored.'}
        </pre>
      )}
    </div>
  )
}
