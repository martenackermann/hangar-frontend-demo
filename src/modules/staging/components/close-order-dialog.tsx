import { useQuery } from '@tanstack/react-query'
import { IdInk } from '@/components/domain/status'
import { useWorkflowAction } from '@/components/drawer/workflow-actions'
import { ConfirmDialog } from '@/components/ui/dialog'
import type { ServiceRequestDetail } from '@/lib/api/types'
import type { ActionDialogProps } from '@/lib/registry'
import { stagingQueries } from '@/modules/staging/api'

/** `close_order` (SPEC §4.1.1 #22): confirms the software and moves devices to goods-out. */
export function CloseOrderDialog({
  entity: sr,
  open,
  onOpenChange,
  onDone,
}: ActionDialogProps<ServiceRequestDetail>) {
  const action = useWorkflowAction('serviceRequest', sr, sr.number)
  const checklist = useQuery({ ...stagingQueries.checklist(sr.id), enabled: open })
  const devices = sr.items.filter((item) => item.direction === 'deliver')
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Close order · ${sr.number}?`}
      description="The devices move to goods-out and the request is ready for picking."
      confirmLabel="Close order"
      pending={action.isPending}
      onConfirm={() =>
        action.mutate({ action: 'close_order' }, { onSuccess: (updated) => onDone(updated) })
      }
    >
      <div className="grid gap-2 text-sm">
        <ul className="grid gap-1" aria-label="Devices">
          {devices.map((item) => (
            <li key={item.slot} className="flex items-center gap-2">
              <IdInk value={item.asset?.assetTag ?? item.asset?.serialNumber} />
              <span className="text-fg-2">{item.asset?.article?.name ?? item.requestedType}</span>
            </li>
          ))}
        </ul>
        {checklist.data && checklist.data.required.length > 0 && (
          <p className="text-fg-2">Software installed: {checklist.data.installed.join(', ')}</p>
        )}
      </div>
    </ConfirmDialog>
  )
}
