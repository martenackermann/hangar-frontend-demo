import { useWorkflowAction } from '@/components/drawer/workflow-actions'
import type { AssetDetail } from '@/lib/api/types'
import type { ActionDialogProps } from '@/lib/registry'
import { CorrectDialog, MarkFoundDialog, MarkMissingDialog } from './asset-dialogs'

/** Drawer action dialogs of the H5 asset actions (registered in `action-dialogs/`). */

export function MarkMissing({
  entity,
  open,
  onOpenChange,
  onDone,
}: ActionDialogProps<AssetDetail>) {
  const label = entity.assetTag ?? entity.serialNumber
  const mutation = useWorkflowAction('asset', entity, label)
  return (
    <MarkMissingDialog
      open={open}
      onOpenChange={onOpenChange}
      subject={label}
      pending={mutation.isPending}
      submit={async (body) => onDone(await mutation.mutateAsync({ action: 'mark_missing', body }))}
    />
  )
}

export function MarkFound({ entity, open, onOpenChange, onDone }: ActionDialogProps<AssetDetail>) {
  const label = entity.assetTag ?? entity.serialNumber
  const mutation = useWorkflowAction('asset', entity, label)
  return (
    <MarkFoundDialog
      open={open}
      onOpenChange={onOpenChange}
      subject={label}
      pending={mutation.isPending}
      submit={async (body) => onDone(await mutation.mutateAsync({ action: 'mark_found', body }))}
    />
  )
}

export function Correct({ entity, open, onOpenChange, onDone }: ActionDialogProps<AssetDetail>) {
  const label = entity.assetTag ?? entity.serialNumber
  const mutation = useWorkflowAction('asset', entity, label)
  return (
    <CorrectDialog
      open={open}
      onOpenChange={onOpenChange}
      subject={label}
      current={{
        status: entity.status,
        locationId: entity.location.id,
        installationPlace: entity.installationPlace,
      }}
      pending={mutation.isPending}
      submit={async (body) => onDone(await mutation.mutateAsync({ action: 'correct', body }))}
    />
  )
}
