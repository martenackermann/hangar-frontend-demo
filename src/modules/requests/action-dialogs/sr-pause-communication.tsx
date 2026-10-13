import { useWorkflowAction } from '@/components/drawer/workflow-actions'
import type { ServiceRequestDetail } from '@/lib/api/types'
import type { ActionDialogDescriptor, ActionDialogProps } from '@/lib/registry'
import { PauseDialog } from '../components/pause-dialog'

function SrPauseDialog({
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

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'pause_communication',
  order: 40,
  component: SrPauseDialog,
}
export default dialog
