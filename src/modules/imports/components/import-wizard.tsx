import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, FileText, Info, TriangleAlert } from 'lucide-react'
import { useId, useState } from 'react'
import { FileDrop } from '@/components/domain/file-drop'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Banner } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { Field } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { coreQueries } from '@/lib/api/core'
import { isApiError } from '@/lib/api/errors'
import type { ImportDetection, ImportOptions, ImportType } from '@/lib/api/types'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatBytes, formatNumber, plural } from '@/lib/format'
import { trackJob } from '@/lib/jobs'
import { cn } from '@/lib/utils'
import {
  detectImport,
  importDownloads,
  importQueries,
  IMPORT_EFFECT_KEYS,
  useStartImport,
} from '../api'
import { downloadFrom } from '@/lib/api/downloads'

/**
 * Upload wizard (SCREENS.md §8.1): 1 File (drop zone → `POST /imports/detect`), 2 Check
 * (detected type with override, header check, row count, 5-row preview, file problems),
 * 3 Options (per type + dry run), 4 Start → `POST /imports` → the import detail.
 */
type Step = 'file' | 'check' | 'options'

const MAX_BYTES = 20 * 1024 * 1024
const IMPORT_TYPES: ImportType[] = [
  'service_requests',
  'lease_returns',
  'contacts',
  'assets_new',
  'asset_status_sync',
]

export function ImportWizard({
  open,
  onOpenChange,
  onStarted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStarted: (importJobId: number) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <WizardBody onClose={() => onOpenChange(false)} onStarted={onStarted} />}
    </Dialog>
  )
}

function WizardBody({
  onClose,
  onStarted,
}: {
  onClose: () => void
  onStarted: (importJobId: number) => void
}) {
  const queryClient = useQueryClient()
  const enums = useEnums()
  const [step, setStep] = useState<Step>('file')
  const [file, setFile] = useState<File | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [detection, setDetection] = useState<ImportDetection | null>(null)
  const [detectError, setDetectError] = useState<string | null>(null)
  const [type, setType] = useState<ImportType | undefined>()
  const [options, setOptions] = useState<ImportOptions>({ dryRun: false })
  const [submitError, setSubmitError] = useState<string | null>(null)
  const templates = useQuery(importQueries.templates())
  const locations = useQuery(coreQueries.stockLocations({ type: ['goods_in', 'staging'] }))
  const start = useStartImport()

  const template = templates.data?.data.find((t) => t.type === type)
  const required = new Set(template?.columns.filter((c) => c.required).map((c) => c.name) ?? [])
  const present = new Set(detection?.normalizedHeaders ?? [])
  const missing = [...required].filter((name) => !present.has(name))
  const known = new Set(template?.columns.map((c) => c.name) ?? [])
  const extra = (detection?.normalizedHeaders ?? []).filter((h) => h && !known.has(h))
  const hubLocations = (locations.data?.data ?? []).filter((l) => l.site?.kind === 'hub')
  const needsLocation = type === 'assets_new' && !options.targetLocationId
  const fileProblems = detection?.problems.filter((p) => p.code !== 'type_not_detected') ?? []

  const choose = async (next: File) => {
    setFile(next)
    setDetecting(true)
    setDetectError(null)
    try {
      const result = await detectImport(next)
      setDetection(result)
      setType(result.detectedType ?? undefined)
      setStep('check')
    } catch (error) {
      setDetectError(
        isApiError(error) ? (error.detail ?? error.title) : 'The file could not be read.',
      )
    } finally {
      setDetecting(false)
    }
  }

  const submit = async () => {
    if (!file || !type) return
    setSubmitError(null)
    try {
      const accepted = await start.mutateAsync({
        file,
        type: type === detection?.detectedType ? undefined : type,
        options,
      })
      void trackJob(queryClient, accepted, {
        title: `Import ${file.name}`,
        invalidate: IMPORT_EFFECT_KEYS,
        describe: (job) =>
          job.result?.kind === 'import'
            ? `${formatNumber(job.result.counts.created)} created · ${formatNumber(job.result.counts.updated)} updated · ${formatNumber(job.result.counts.errors)} errors`
            : undefined,
      })
      onStarted(accepted.importJobId)
      onClose()
    } catch (error) {
      if (isApiError(error)) {
        const messages = Object.values(error.fieldErrors).flat()
        setSubmitError(messages.length ? messages.join(' ') : (error.detail ?? error.title))
      } else {
        setSubmitError('The import could not be started.')
      }
    }
  }

  const steps: { id: Step; label: string }[] = [
    { id: 'file', label: 'File' },
    { id: 'check', label: 'Check' },
    { id: 'options', label: 'Options' },
  ]
  const stepIndex = steps.findIndex((s) => s.id === step)

  const footer = (
    <>
      {step !== 'file' && (
        <Button
          variant="ghost"
          className="mr-auto"
          onClick={() => setStep(step === 'options' ? 'check' : 'file')}
        >
          Back
        </Button>
      )}
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      {step === 'check' && (
        <Button
          variant="primary"
          disabled={!type || missing.length > 0 || fileProblems.length > 0}
          onClick={() => setStep('options')}
        >
          Continue
        </Button>
      )}
      {step === 'options' && (
        <Button
          variant="primary"
          loading={start.isPending}
          disabled={needsLocation}
          onClick={() => void submit()}
        >
          {options.dryRun ? 'Start dry run' : 'Start import'}
        </Button>
      )}
    </>
  )

  return (
    <DialogContent
      title="New import"
      description="Upload an ITSM or partner export. The type is detected from its column headers."
      className="w-[min(920px,calc(100vw-24px))]"
      footer={footer}
    >
      <ol className="mb-4 flex items-center gap-2 text-xs" aria-label="Steps">
        {steps.map((s, index) => (
          <li
            key={s.id}
            aria-current={s.id === step ? 'step' : undefined}
            className={cn(
              'flex items-center gap-1.5',
              index <= stepIndex ? 'text-fg' : 'text-fg-3',
            )}
          >
            <span
              className={cn(
                'grid size-5 place-items-center rounded-full border font-mono text-2xs',
                index < stepIndex && 'border-accent bg-accent text-fg-on-accent',
                index === stepIndex && 'border-accent text-accent-text',
                index > stepIndex && 'border-line',
              )}
            >
              {index + 1}
            </span>
            {s.label}
            {index < steps.length - 1 && <span className="mx-1 h-px w-6 bg-line" aria-hidden />}
          </li>
        ))}
      </ol>

      {step === 'file' && (
        <div className="grid gap-3">
          <FileDrop
            onFile={(next) => void choose(next)}
            maxBytes={MAX_BYTES}
            disabled={detecting}
            label={
              detecting ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> Reading {file?.name}…
                </span>
              ) : (
                'Drop an ITSM export (.csv or .xlsx) here or choose a file'
              )
            }
            hint="Any file name works — up to 20 MB and 50,000 rows, UTF-8 for CSV."
          />
          {detectError && (
            <Banner tone="critical" icon={CircleAlert} title="The file was not accepted">
              {detectError}
            </Banner>
          )}
        </div>
      )}

      {step === 'check' && detection && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Icon icon={FileText} className="text-fg-3" />
            <span className="font-medium">{file?.name}</span>
            <span className="text-fg-3">
              {file ? formatBytes(file.size) : ''} · {plural(detection.rowCount, 'row')}
              {detection.delimiter ? ` · delimiter "${detection.delimiter}"` : ' · workbook'}
            </span>
          </div>
          {fileProblems.map((problem) => (
            <Banner
              key={problem.code}
              tone="critical"
              icon={CircleAlert}
              title="The file cannot be imported"
            >
              {problem.message}
            </Banner>
          ))}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,280px)_1fr]">
            <Field
              label="Import type"
              help={
                detection.detectedType
                  ? type === detection.detectedType
                    ? 'Detected from the column headers.'
                    : `Detected: ${enumLabel(enums, 'importType', detection.detectedType)} — overridden.`
                  : 'Not detected — choose the type of this file.'
              }
            >
              {({ id }) => (
                <Select<ImportType>
                  id={id}
                  value={type}
                  onValueChange={(next) => {
                    setType(next)
                    setOptions((current) => ({ dryRun: current.dryRun }))
                  }}
                  placeholder="Choose a type…"
                  options={IMPORT_TYPES.map((value) => ({
                    value,
                    label: enumLabel(enums, 'importType', value),
                  }))}
                />
              )}
            </Field>
            <p className="self-end text-sm text-fg-2">{template?.description}</p>
          </div>
          {type && template && (
            <div className="grid gap-1.5" aria-live="polite">
              {missing.length === 0 ? (
                <p className="flex items-center gap-1.5 text-sm text-tone-done-fg">
                  <Icon icon={CircleCheck} size={14} /> All {required.size} required columns found
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-sm text-tone-critical-fg">
                  <Icon icon={CircleAlert} size={14} /> Missing required columns:{' '}
                  <span className="font-mono">{missing.join(', ')}</span>
                </p>
              )}
              {extra.length > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-tone-caution-fg">
                  <Icon icon={TriangleAlert} size={14} /> {plural(extra.length, 'column')} will be
                  ignored: <span className="font-mono">{extra.join(', ')}</span>
                </p>
              )}
            </div>
          )}
          {detection.preview.length > 0 && (
            <div className="grid gap-1.5">
              <h3 className="text-xs font-semibold text-fg-2">
                Preview · first {Math.min(5, detection.preview.length)} rows
              </h3>
              <div className="max-h-56 overflow-auto rounded-sm border border-line">
                <table className="w-max min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-surface">
                    <tr>
                      {detection.normalizedHeaders.filter(Boolean).map((header) => (
                        <th
                          key={header}
                          scope="col"
                          className={cn(
                            'border-b border-line px-2 py-1.5 font-mono font-medium whitespace-nowrap',
                            required.has(header)
                              ? 'text-fg'
                              : known.has(header)
                                ? 'text-fg-2'
                                : 'text-fg-3 line-through',
                          )}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detection.preview.map((row, index) => (
                      <tr key={index} className="border-b border-line-subtle last:border-0">
                        {detection.normalizedHeaders.filter(Boolean).map((header) => (
                          <td
                            key={header}
                            title={row[header] ?? ''}
                            className="max-w-64 truncate px-2 py-1 font-mono whitespace-nowrap text-fg-2"
                          >
                            {row[header] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'options' && type && (
        <div className="grid max-w-[560px] gap-4">
          <p className="text-sm text-fg-2">
            {enumLabel(enums, 'importType', type)} · {file?.name} ·{' '}
            {plural(detection?.rowCount ?? 0, 'row')}
          </p>
          {type === 'assets_new' && (
            <Field
              label="Receive into"
              required
              help="Hub location (goods in or staging) the delivered devices are booked into."
            >
              {({ id }) => (
                <Select<string>
                  id={id}
                  value={options.targetLocationId ? String(options.targetLocationId) : undefined}
                  onValueChange={(value) =>
                    setOptions((current) => ({ ...current, targetLocationId: Number(value) }))
                  }
                  placeholder="Choose a location…"
                  options={hubLocations.map((location) => ({
                    value: String(location.id),
                    label: location.name,
                  }))}
                />
              )}
            </Field>
          )}
          {type === 'lease_returns' && (
            <OptionCheck
              checked={Boolean(options.markMissingAsProbablyClosed)}
              onCheckedChange={(checked) =>
                setOptions((current) => ({ ...current, markMissingAsProbablyClosed: checked }))
              }
              title="Mark lease returns missing from this file as probably closed"
              hint='Use for full exports only. Open lease returns not in the file move to "Probably closed" for review.'
            />
          )}
          <OptionCheck
            checked={Boolean(options.dryRun)}
            onCheckedChange={(checked) =>
              setOptions((current) => ({ ...current, dryRun: checked }))
            }
            title="Dry run (validate only, no changes)"
            hint="Every row is checked and counted; nothing is written."
          />
          {submitError && (
            <Banner tone="critical" icon={CircleAlert} title="The import could not be started">
              {submitError}
            </Banner>
          )}
          {!options.dryRun && (
            <p className="flex items-start gap-1.5 text-xs text-fg-3">
              <Icon icon={Info} size={14} className="mt-px shrink-0" />
              The import keeps running if you leave this page; a toast tells you when it is done.
            </p>
          )}
        </div>
      )}
      {step === 'file' && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-3">
          <span>Samples:</span>
          {IMPORT_TYPES.map((value) => (
            <Button
              key={value}
              variant="link"
              size="sm"
              onClick={() => void downloadFrom(() => importDownloads.sample(value))}
            >
              {enumLabel(enums, 'importType', value)}
            </Button>
          ))}
        </div>
      )}
    </DialogContent>
  )
}

/** An option checkbox with a title and a hint line; both are part of the accessible label. */
function OptionCheck({
  checked,
  onCheckedChange,
  title,
  hint,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  title: string
  hint: string
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-2 text-sm">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={`${id}-hint`}
        className="mt-0.5"
      />
      <div>
        <label htmlFor={id}>{title}</label>
        <span id={`${id}-hint`} className="block text-xs text-fg-3">
          {hint}
        </span>
      </div>
    </div>
  )
}
