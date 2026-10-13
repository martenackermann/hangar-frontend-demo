import type { ActionDialogProps } from '@/lib/registry'
import type { ServiceRequestDetail } from '@/lib/api/types'
import { BookAppointmentForm } from './appointment-forms'
import { CompleteForm } from './on-site-forms'
import { DeviationActionForm } from './on-site-forms'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { RequestRescheduleForm } from './appointment-forms'

/** Action dialogs of the H4 SR actions (registered in `action-dialogs/`). */

export function BookAppointmentDialog({
  entity,
  open,
  onOpenChange,
  onDone,
}: ActionDialogProps<ServiceRequestDetail>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Book appointment · ${entity.number}`}
        description="The appointment is created at the booking provider."
      >
        <BookAppointmentForm sr={entity} onDone={onDone} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

export function CancelOnSiteDialog({
  entity,
  open,
  onOpenChange,
  onDone,
}: ActionDialogProps<ServiceRequestDetail>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Cancel on site · ${entity.number}`}
        description="The order ends here and the new devices go back to stock."
      >
        <DeviationActionForm
          sr={entity}
          action="cancel_on_site"
          onDone={onDone}
          onCancel={() => onOpenChange(false)}
          compact
        />
      </DialogContent>
    </Dialog>
  )
}

export function CompleteDeploymentDialog({
  entity,
  open,
  onOpenChange,
  onDone,
}: ActionDialogProps<ServiceRequestDetail>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Complete deployment · ${entity.number}`}
        description="Verified devices are deployed and collected; the handover protocol is stored."
      >
        <CompleteForm sr={entity} onDone={onDone} compact />
      </DialogContent>
    </Dialog>
  )
}

export function RequestRescheduleDialog({
  entity,
  open,
  onOpenChange,
  onDone,
}: ActionDialogProps<ServiceRequestDetail>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Request reschedule · ${entity.number}`}
        description="The request waits for a new appointment and continues where it stopped."
      >
        <RequestRescheduleForm sr={entity} onDone={onDone} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

export function RescheduleOnSiteDialog({
  entity,
  open,
  onOpenChange,
  onDone,
}: ActionDialogProps<ServiceRequestDetail>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Reschedule on site · ${entity.number}`}
        description="The visit did not take place; dispatch books a new date."
      >
        <DeviationActionForm
          sr={entity}
          action="reschedule_on_site"
          onDone={onDone}
          onCancel={() => onOpenChange(false)}
          compact
        />
      </DialogContent>
    </Dialog>
  )
}
