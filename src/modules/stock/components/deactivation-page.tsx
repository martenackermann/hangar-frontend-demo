import { useQuery } from '@tanstack/react-query'
import { CircleSlash, Download, FileX, OctagonX, X } from 'lucide-react'
import { useState } from 'react'
import { DataTable, type DataColumn } from '@/components/data-table/data-table'
import { FileDrop } from '@/components/domain/file-drop'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Banner, EmptyState, SkeletonRows, ToneBadge } from '@/components/ui/feedback'
import { Field } from '@/components/ui/input'
import { Page, PageHeader, Panel } from '@/components/ui/page'
import { Select } from '@/components/ui/select'
import { notify } from '@/components/ui/toast'
import { useAppConfig } from '@/lib/api/core'
import { downloadGet, openDownload } from '@/lib/api/downloads'
import { isApiError } from '@/lib/api/errors'
import type { DeactivationBatch, DeactivationReason, DeactivationResult, Tone } from '@/lib/api/types'
import { useEnums } from '@/lib/enums'
import { formatBytes, formatDateTime, formatNumber } from '@/lib/format'
import { stockQueries, useDeactivationUpload } from '../api'

export interface DeactivationSearch {
  batch?: number | undefined
  page: number
}

const OUTCOME: Record<DeactivationResult['sample'][number]['outcome'], { label: string; tone: Tone }> = {
  deactivated: { label: 'Deactivated', tone: 'done' },
  already_deactivated: { label: 'Already deactivated', tone: 'intake' },
  rejected: { label: 'Rejected', tone: 'caution' },
  not_found: { label: 'Not found', tone: 'critical' },
}

function Count({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="grid gap-0.5 px-4 py-3">
      <span className="text-xs text-fg-3">{label}</span>
      <span className={`text-2xl font-semibold ${tone ?? ''}`}>{formatNumber(value)}</span>
    </div>
  )
}

function ResultPanel({ result, onClose }: { result: DeactivationResult; onClose: () => void }) {
  const enums = useEnums()
  const reason = enums.deactivationReason.find((r) => r.value === result.reason)?.label ?? result.reason
  return (
    <Panel
      title={`Result · ${result.originalFilename}`}
      actions={
        <>
          {result.notFoundReport && (
            <Button size="sm" icon={Download} onClick={() => result.notFoundReport && void openDownload(result.notFoundReport)}>
              Not found CSV
            </Button>
          )}
          {result.rejectedReport && (
            <Button size="sm" icon={Download} onClick={() => result.rejectedReport && void openDownload(result.rejectedReport)}>
              Rejected CSV
            </Button>
          )}
          <IconButton size="sm" icon={X} label="Close result" onClick={onClose} />
        </>
      }
    >
      <p className="mb-3 text-sm text-fg-2">
        {reason} · {formatNumber(result.totalRows)} serials · uploaded {formatDateTime(result.createdAt)} by{' '}
        {result.createdBy.displayName}
      </p>
      <div className="-mx-4 mb-3 grid grid-cols-5 divide-x divide-line border-y border-line max-md:grid-cols-2">
        <Count label="Deactivated" value={result.deactivatedCount} tone="text-tone-done-fg" />
        <Count label="Already deactivated" value={result.alreadyDeactivatedCount} />
        <Count label="Rejected" value={result.rejectedCount} tone={result.rejectedCount ? 'text-tone-caution-fg' : ''} />
        <Count label="Not found" value={result.notFoundCount} tone={result.notFoundCount ? 'text-tone-critical-fg' : ''} />
        <Count label="Lease returns closed" value={result.closedLeaseReturns} />
      </div>
      <h3 className="mb-1 text-xs font-semibold text-fg-2">First {result.sample.length} rows</h3>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line text-xs text-fg-3">
              <th className="h-8 text-left font-medium">Serial</th>
              <th className="text-left font-medium">Outcome</th>
              <th className="text-left font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {result.sample.map((row) => (
              <tr key={row.serialNumber} className="h-row border-b border-line-subtle last:border-0">
                <td className="hg-mono pr-3">{row.serialNumber}</td>
                <td className="pr-3">
                  <ToneBadge tone={OUTCOME[row.outcome].tone}>{OUTCOME[row.outcome].label}</ToneBadge>
                </td>
                <td className="text-fg-2">{row.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

export function DeactivationPage({
  search,
  onSearchChange,
}: {
  search: DeactivationSearch
  onSearchChange: (patch: Partial<DeactivationSearch>) => void
}) {
  const enums = useEnums()
  const config = useAppConfig()
  const upload = useDeactivationUpload()
  const [reason, setReason] = useState<DeactivationReason>('returned_to_lessor')
  const [file, setFile] = useState<File | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<{ title: string; detail?: string } | null>(null)
  const history = useQuery(stockQueries.deactivations(search.page))
  const result = useQuery({ ...stockQueries.deactivation(search.batch ?? 0), enabled: Boolean(search.batch) })
  const reasonLabel = enums.deactivationReason.find((r) => r.value === reason)?.label ?? reason
  const maxRows = config?.limits.deactivationMaxRows ?? 10_000

  const submit = async () => {
    if (!file) return
    setError(null)
    try {
      const created = await upload.mutateAsync({ file, reason })
      setConfirm(false)
      setFile(null)
      notify.success(`${formatNumber(created.deactivatedCount)} devices deactivated`, {
        description: `${created.notFoundCount} not found · ${created.rejectedCount} rejected · ${created.closedLeaseReturns} lease returns closed`,
      })
      onSearchChange({ batch: created.id })
    } catch (err) {
      setConfirm(false)
      setError(
        isApiError(err)
          ? { title: err.title, detail: err.detail ?? Object.values(err.fieldErrors).flat().join(' ') }
          : { title: 'The upload failed.' },
      )
    }
  }

  const columns: DataColumn<DeactivationBatch>[] = [
    { id: 'date', header: 'Date', cell: (row) => formatDateTime(row.createdAt), width: 170, locked: true },
    {
      id: 'reason',
      header: 'Reason',
      cell: (row) => enums.deactivationReason.find((r) => r.value === row.reason)?.label ?? row.reason,
      width: 160,
    },
    { id: 'file', header: 'File', cell: (row) => row.originalFilename, width: 230 },
    { id: 'total', header: 'Total', cell: (row) => formatNumber(row.totalRows), align: 'end', width: 80 },
    { id: 'deactivated', header: 'Deactivated', cell: (row) => formatNumber(row.deactivatedCount), align: 'end', width: 110 },
    { id: 'rejected', header: 'Rejected', cell: (row) => formatNumber(row.rejectedCount), align: 'end', width: 90 },
    { id: 'notFound', header: 'Not found', cell: (row) => formatNumber(row.notFoundCount), align: 'end', width: 90 },
    { id: 'by', header: 'By', cell: (row) => row.createdBy.displayName, width: 160 },
  ]

  return (
    <Page className="overflow-y-auto">
      <PageHeader title="Deactivation import" meta="Record devices that left the fleet in bulk" />
      <div className="grid shrink-0 gap-4 px-4 pb-4">
        <Panel title="Upload">
          <div className="grid grid-cols-[minmax(0,280px)_minmax(0,1fr)] gap-4 max-md:grid-cols-1">
            <div className="grid content-start gap-3">
              <Field label="Reason" required help="Sets the deactivated status of every device in the file.">
                {({ id }) => (
                  <Select<DeactivationReason>
                    id={id}
                    label="Reason"
                    value={reason}
                    onValueChange={setReason}
                    options={enums.deactivationReason.map((r) => ({ value: r.value as DeactivationReason, label: r.label }))}
                  />
                )}
              </Field>
              {file && (
                <p className="text-sm">
                  <span className="text-fg-3">File </span>
                  <b className="font-medium">{file.name}</b>
                  <span className="text-fg-3"> · {formatBytes(file.size)}</span>
                </p>
              )}
              <Button variant="primary" icon={CircleSlash} disabled={!file} loading={upload.isPending} onClick={() => setConfirm(true)}>
                Deactivate
              </Button>
            </div>
            <FileDrop
              onFile={(next) => {
                setFile(next)
                setError(null)
              }}
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              maxBytes={config?.limits.importMaxBytes}
              label={
                <>
                  CSV or XLSX with a <code className="hg-mono">serial_number</code> column, up to {formatNumber(maxRows)} rows
                </>
              }
              hint="Optional asset_tag column. Devices in a request workflow are rejected, not deactivated."
              sample={{ label: 'Download sample file', onClick: () => void downloadGet('/deactivations/sample') }}
            />
          </div>
          {error && (
            <Banner tone="critical" icon={OctagonX} title={error.title} className="mt-3">
              {error.detail}
            </Banner>
          )}
        </Panel>
        {search.batch &&
          (result.data ? (
            <ResultPanel result={result.data} onClose={() => onSearchChange({ batch: undefined })} />
          ) : result.isError ? (
            <Banner tone="critical" icon={OctagonX} title="This upload could not be loaded." />
          ) : (
            <SkeletonRows rows={4} />
          ))}
      </div>
      <h2 className="px-4 pb-1 text-sm font-semibold">History</h2>
      <DataTable
        label="Deactivation uploads"
        keyboard={false}
        columns={columns}
        rows={history.data?.data ?? []}
        getRowId={(row) => String(row.id)}
        total={history.data?.meta.total}
        loading={history.isPending}
        error={history.error}
        onRetry={() => void history.refetch()}
        activeId={search.batch ? String(search.batch) : null}
        onOpen={(row) => onSearchChange({ batch: row.id })}
        pagination={{
          page: search.page,
          perPage: 25,
          total: history.data?.meta.total ?? 0,
          onPageChange: (page) => onSearchChange({ page }),
        }}
        empty={<EmptyState icon={FileX} title="No deactivation uploads yet." />}
        className="min-h-72"
      />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Deactivate devices from ${file?.name ?? 'the file'} as ${reasonLabel.toLowerCase()}?`}
        description="Matching devices leave the fleet (off fleet), their open lease returns are closed. This cannot be undone from here."
        confirmLabel="Deactivate"
        destructive
        pending={upload.isPending}
        onConfirm={submit}
      />
    </Page>
  )
}
