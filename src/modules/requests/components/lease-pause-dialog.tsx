import { useWorkflowAction } from '@/components/drawer/workflow-actions'
import type { LeaseReturnDetail } from '@/lib/api/types'
import type { ActionDialogProps } from '@/lib/registry'
import { PauseDialog } from './pause-dialog'

export function LeasePauseDialog({
  entity,
  open,
  onOpenChange,
  onDone,
}: ActionDialogProps<LeaseReturnDetail>) {
  const mutation = useWorkflowAction('leaseReturn', entity, entity.assetTag)
  return (
    <PauseDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Pause communication · ${entity.assetTag}`}
      onSubmit={(body) =>
        mutation.mutateAsync({ action: 'pause_communication', body }).then(onDone)
      }
    />
  )
}
