import { ConfirmDialog } from '@/components/ui/dialog'
import { useWorkflowAction } from '@/components/drawer/workflow-actions'
import type { ServiceRequestDetail } from '@/lib/api/types'
import type { ActionDialogProps } from '@/lib/registry'

/** `close_without_label` (SPEC §4.1.1 #25): parcel request handed over without a carrier label. */
export function CloseWithoutLabelDialog({
  entity: sr,
  open,
  onOpenChange,
  onDone,
}: ActionDialogProps<ServiceRequestDetail>) {
  const action = useWorkflowAction('serviceRequest', sr, sr.number)
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Close without label · ${sr.number}?`}
      description="No carrier label is created (for example a courier run). The devices count as provided and the technician completes the visit."
      confirmLabel="Close without label"
      comment={{ required: true, label: 'Why is no label needed?' }}
      pending={action.isPending}
      onConfirm={(comment) =>
        action.mutate(
          { action: 'close_without_label', body: { comment } },
          { onSuccess: (updated) => onDone(updated) },
        )
      }
    />
  )
}
