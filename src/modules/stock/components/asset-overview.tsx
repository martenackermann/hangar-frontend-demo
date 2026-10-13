import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { useDrawerNavigation } from '@/components/drawer/drawer-state'
import { IdInk, StatusBadge } from '@/components/domain/status'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { KeyValue, KeyValues, SectionHeading } from '@/components/ui/page'
import { notify } from '@/components/ui/toast'
import { api } from '@/lib/api/client'
import { isApiError } from '@/lib/api/errors'
import { assetKeys } from '@/lib/api/keys'
import type { AssetDetail, AssetPatch } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { useEnums } from '@/lib/enums'
import { formatDate, formatFullDateTime, formatRelative } from '@/lib/format'
import { useShortcut } from '@/lib/shortcuts'

const FIELDS = [
  { key: 'assetTag', label: 'Asset tag', help: 'GX + 6 digits; must be unique.' },
  { key: 'macAddress', label: 'MAC address', help: 'AA:BB:CC:DD:EE:FF' },
  { key: 'externalAssetId', label: 'ITSM asset id', help: undefined },
  { key: 'ciName', label: 'CI name', help: undefined },
] as const

type FieldKey = (typeof FIELDS)[number]['key']

function MetadataForm({ asset, onDone }: { asset: AssetDetail; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<FieldKey, string>>({
    assetTag: asset.assetTag ?? '',
    macAddress: asset.macAddress ?? '',
    externalAssetId: asset.externalAssetId ?? '',
    ciName: asset.ciName ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const mutation = useMutation({
    mutationFn: (body: AssetPatch) => api.patch<AssetDetail>(`/assets/${asset.id}`, body),
    meta: { errorToast: false },
    onSuccess: async (updated) => {
      queryClient.setQueryData(assetKeys.detail(asset.id), updated)
      await queryClient.invalidateQueries({ queryKey: assetKeys.lists() })
    },
  })
  const save = async () => {
    const body: AssetPatch = { version: asset.version }
    for (const field of FIELDS) {
      const value = values[field.key].trim()
      const current = asset[field.key] ?? ''
      if (value !== current) body[field.key] = value || null
    }
    try {
      await mutation.mutateAsync(body)
      notify.success(`Saved · ${asset.assetTag ?? asset.serialNumber}`)
      onDone()
    } catch (error) {
      if (isApiError(error) && error.isVersionConflict) {
        setErrors({ root: 'This record changed. Close the editor and reload.' })
      } else if (isApiError(error) && error.status === 409) {
        setErrors({ assetTag: error.detail ?? 'This asset tag is already used.' })
      } else if (isApiError(error)) {
        setErrors(
          Object.fromEntries(Object.entries(error.fieldErrors).map(([k, v]) => [k, v.join(' ')])),
        )
      }
    }
  }
  useShortcut('mod+s', () => void save(), {
    allowInInput: true,
    description: 'Save',
    group: 'Drawer',
  })
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        {FIELDS.map((field) => (
          <Field key={field.key} label={field.label} help={field.help} error={errors[field.key]}>
            {({ id, invalid }) => (
              <Input
                id={id}
                invalid={invalid}
                className="font-mono"
                value={values[field.key]}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                }
              />
            )}
          </Field>
        ))}
      </div>
      {errors.root && (
        <p role="alert" className="text-sm text-tone-critical-fg">
          {errors.root}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="primary"
          shortcut="mod+s"
          loading={mutation.isPending}
          onClick={() => void save()}
        >
          Save
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function AssetOverview({ asset }: { asset: AssetDetail }) {
  const enums = useEnums()
  const drawer = useDrawerNavigation()
  const canEdit = useCan('assets.update')
  const [editing, setEditing] = useState(false)
  const source = enums.assetSource.find((s) => s.value === asset.source)?.label ?? asset.source
  return (
    <div className="grid gap-1">
      <KeyValues>
        <KeyValue label="Article">
          {asset.article ? (
            <>
              <IdInk value={asset.article.number} className="mr-1.5 text-xs" />
              {asset.article.name}
            </>
          ) : (
            (asset.model ?? 'Unknown model')
          )}
        </KeyValue>
        <KeyValue label="Model">{asset.model}</KeyValue>
        <KeyValue label="Status">
          <StatusBadge entity="assetStatus" state={asset.status} since={asset.statusChangedAt} />
        </KeyValue>
        <KeyValue label="Location">{asset.location.name}</KeyValue>
        <KeyValue label="Installation place">
          {asset.installationPlace && <span className="hg-mono">{asset.installationPlace}</span>}
        </KeyValue>
        <KeyValue label="Hub / site">{asset.site?.name}</KeyValue>
        <KeyValue label="Service request">
          {asset.serviceRequest && (
            <button
              type="button"
              className="text-accent-text hover:underline"
              onClick={() => asset.serviceRequest && drawer.open('sr', asset.serviceRequest.id)}
            >
              <IdInk value={asset.serviceRequest.number} />
            </button>
          )}
        </KeyValue>
        <KeyValue label="Employee">{asset.assignedContact?.displayName}</KeyValue>
        <KeyValue label="Lease return">
          {asset.leaseReturn && (
            <button
              type="button"
              className="inline-flex items-center gap-2 text-left hover:underline"
              onClick={() => asset.leaseReturn && drawer.open('lr', asset.leaseReturn.id)}
            >
              <StatusBadge entity="leaseReturnStatus" state={asset.leaseReturn.status} size="sm" />
              <span className="text-xs text-fg-3">
                retires {formatDate(asset.leaseReturn.retirementDate)}
              </span>
            </button>
          )}
        </KeyValue>
        <KeyValue label="Checked in">{formatFullDateTime(asset.checkedInAt)}</KeyValue>
        <KeyValue label="Last change">
          {formatRelative(asset.statusChangedAt)} · {formatFullDateTime(asset.statusChangedAt)}
        </KeyValue>
        <KeyValue label="Source">{source}</KeyValue>
      </KeyValues>
      <SectionHeading
        actions={
          canEdit &&
          !editing && (
            <Button
              size="sm"
              variant="ghost"
              icon={Pencil}
              shortcut="e"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          )
        }
      >
        Identifiers
      </SectionHeading>
      {editing ? (
        <MetadataForm asset={asset} onDone={() => setEditing(false)} />
      ) : (
        <KeyValues>
          <KeyValue label="Asset tag">
            {asset.assetTag && <span className="hg-mono">{asset.assetTag}</span>}
          </KeyValue>
          <KeyValue label="MAC address">
            {asset.macAddress && <span className="hg-mono">{asset.macAddress}</span>}
          </KeyValue>
          <KeyValue label="ITSM asset id">{asset.externalAssetId}</KeyValue>
          <KeyValue label="CI name">{asset.ciName}</KeyValue>
          <KeyValue label="Order number">{asset.orderNumber}</KeyValue>
        </KeyValues>
      )}
      <EditShortcut enabled={canEdit && !editing} onEdit={() => setEditing(true)} />
    </div>
  )
}

function EditShortcut({ enabled, onEdit }: { enabled: boolean; onEdit: () => void }) {
  useShortcut('e', onEdit, { enabled, description: 'Edit identifiers', group: 'Drawer' })
  return null
}
