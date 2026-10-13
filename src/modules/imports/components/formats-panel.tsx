import { useQuery } from '@tanstack/react-query'
import { Download, Sparkles } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { coreQueries } from '@/lib/api/core'
import { downloadFrom } from '@/lib/api/downloads'
import type { ImportType } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { cn } from '@/lib/utils'
import { importDownloads, importQueries } from '../api'

/**
 * Side panel "Formats" (SCREENS.md §8.1): per import type the column spec
 * (`GET /imports/templates`), Download sample, and in demo mode "Generate fresh ITSM export".
 */
export function FormatsPanel({ className }: { className?: string }) {
  const enums = useEnums()
  const templates = useQuery(importQueries.templates())
  const config = useQuery(coreQueries.config())
  const canCreate = useCan('imports.create')
  const [type, setType] = useState<ImportType>('service_requests')
  const [rows, setRows] = useState('25')
  const [withErrors, setWithErrors] = useState(false)
  const fieldId = useId()
  const template = templates.data?.data.find((t) => t.type === type)

  return (
    <aside
      aria-labelledby="formats-title"
      className={cn('flex min-h-0 flex-col border-l border-line bg-surface', className)}
    >
      <div className="grid gap-2 border-b border-line-subtle px-4 py-3">
        <h2 id="formats-title" className="text-sm font-semibold">
          Formats
        </h2>
        <Select<ImportType>
          label="Import type"
          value={type}
          onValueChange={setType}
          options={(templates.data?.data ?? []).map((t) => ({
            value: t.type,
            label: enumLabel(enums, 'importType', t.type),
          }))}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">
        {!template ? (
          <div className="grid gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <div className="grid gap-3">
            <p className="text-fg-2">{template.description}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-fg-3">Detected by</dt>
              <dd className="font-mono">{template.signatureHeaders.join(' + ')}</dd>
              <dt className="text-fg-3">Upsert key</dt>
              <dd className="font-mono">{template.upsertKey}</dd>
            </dl>
            <Button
              size="sm"
              icon={Download}
              className="justify-self-start"
              onClick={() => void downloadFrom(() => importDownloads.sample(type))}
            >
              Download sample
            </Button>
            <ul className="grid gap-2" aria-label="Columns">
              {template.columns.map((column) => (
                <li key={column.name} className="grid gap-0.5 border-t border-line-subtle pt-2">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <code className="font-mono text-xs text-fg">{column.name}</code>
                    {column.required && (
                      <span className="text-2xs font-semibold text-accent-text">required</span>
                    )}
                    <span className="font-mono text-2xs text-fg-3">{column.format}</span>
                  </span>
                  <span className="text-xs text-fg-2">{column.description}</span>
                  {column.example && (
                    <span className="truncate font-mono text-2xs text-fg-3" title={column.example}>
                      e.g. {column.example}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {template.packedFields.map((field) => (
              <div key={field.column} className="grid gap-1.5 rounded-sm bg-sunken p-2.5">
                <h3 className="text-xs font-semibold">
                  Keys of <code className="font-mono">{field.column}</code>
                </h3>
                <p className="text-2xs text-fg-3">
                  Written as <code className="font-mono">[Key: value],[Key: value]</code>; the cell
                  must be quoted in CSV.
                </p>
                <ul className="grid gap-1">
                  {field.keys.map((key) => (
                    <li key={key.key} className="text-xs">
                      <span className="font-medium">{key.key}</span>
                      {key.required && <span className="text-accent-text"> · required</span>}
                      <span className="text-fg-3"> — {key.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {template.options.length > 0 && (
              <div className="grid gap-1">
                <h3 className="text-xs font-semibold">Options</h3>
                <ul className="grid gap-1 text-xs">
                  {template.options.map((option) => (
                    <li key={option.name}>
                      <code className="font-mono">{option.name}</code>
                      {option.required && <span className="text-accent-text"> · required</span>}
                      <span className="text-fg-3"> — {option.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {config.data?.demoMode && canCreate && (
              <div className="grid gap-2 border-t border-line-subtle pt-3">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold">
                  Generate fresh ITSM export
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-fg-2">
                    <label htmlFor={`${fieldId}-rows`}>Rows</label>
                    <Input
                      id={`${fieldId}-rows`}
                      type="number"
                      min={1}
                      max={500}
                      value={rows}
                      onChange={(event) => setRows(event.target.value)}
                      className="w-20"
                    />
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-fg-2">
                    <Checkbox
                      id={`${fieldId}-errors`}
                      checked={withErrors}
                      onCheckedChange={setWithErrors}
                    />
                    <label htmlFor={`${fieldId}-errors`}>With errors</label>
                  </span>
                </div>
                <Button
                  size="sm"
                  icon={Sparkles}
                  className="justify-self-start"
                  onClick={() =>
                    void downloadFrom(() =>
                      importDownloads.generate({
                        type,
                        rows: Math.min(500, Math.max(1, Number(rows) || 25)),
                        withErrors,
                      }),
                    )
                  }
                >
                  Generate export
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
