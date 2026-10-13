import { useWorkflowAction } from '@/components/drawer/workflow-actions'
import type { ServiceRequestDetail } from '@/lib/api/types'
import type { ActionDialogProps } from '@/lib/registry'
import { PauseDialog } from './pause-dialog'

export function SrPauseDialog({
  entity,
  open,
  onOpenChange,
  onDone,
}: ActionDialogProps<ServiceRequestDetail>) {
  const mutation = useWorkflowAction('serviceRequest', entity, entity.number)
  return (
    <PauseDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Pause communication · ${entity.number}`}
      onSubmit={(body) =>
        mutation.mutateAsync({ action: 'pause_communication', body }).then(onDone)
      }
    />
  )
}
