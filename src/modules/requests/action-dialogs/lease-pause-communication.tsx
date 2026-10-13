import { useWorkflowAction } from '@/components/drawer/workflow-actions'
import type { LeaseReturnDetail } from '@/lib/api/types'
import type { ActionDialogDescriptor, ActionDialogProps } from '@/lib/registry'
import { PauseDialog } from '../components/pause-dialog'

function LeasePauseDialog({
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

const dialog: ActionDialogDescriptor = {
  resource: 'leaseReturn',
  action: 'pause_communication',
  order: 40,
  component: LeasePauseDialog,
}
export default dialog
