import { ConfirmDialog } from '@/components/ui/dialog'
import { useWorkflowAction } from '@/components/drawer/workflow-actions'
import type { ServiceRequestDetail } from '@/lib/api/types'
import type { ActionDialogProps } from '@/lib/registry'

/** `skip_preparation` (SPEC §4.1.1 #20): devices go to goods-out without preparation. */
export function SkipPreparationDialog({
  entity: sr,
  open,
  onOpenChange,
  onDone,
}: ActionDialogProps<ServiceRequestDetail>) {
  const action = useWorkflowAction('serviceRequest', sr, sr.number)
  const devices = sr.items.filter((item) => item.direction === 'deliver' && item.asset)
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Skip preparation · ${sr.number}?`}
      description={
        devices.length
          ? `${devices.length} assigned device${devices.length === 1 ? '' : 's'} move straight to goods-out without software preparation; the order is closed.`
          : 'Nothing to prepare: the request only collects old devices. It moves to picking.'
      }
      confirmLabel="Skip preparation"
      pending={action.isPending}
      onConfirm={() =>
        action.mutate({ action: 'skip_preparation' }, { onSuccess: (updated) => onDone(updated) })
      }
    />
  )
}
