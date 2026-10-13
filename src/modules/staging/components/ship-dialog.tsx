import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { ServiceRequestDetail, ShipmentCreated } from '@/lib/api/types'
import type { ActionDialogProps } from '@/lib/registry'
import {
  ShipmentForm,
  ShipmentResult,
  ShipToCard,
  type ShipToView,
} from '@/modules/staging/components/shipment-form'

function shipToOf(sr: ServiceRequestDetail): ShipToView {
  if (sr.deliveryType === 'parcel_to_pickup_point') {
    return {
      kind: 'pickup_point',
      recipientName: `${sr.region?.name ?? 'Region'} pickup point`,
      name2: `Attn: ${sr.contact.displayName}`,
      address: { street: null, zip: null, city: sr.region?.name ?? null, country: null },
    }
  }
  const room = [
    sr.deliveryAddress.room ? `Room ${sr.deliveryAddress.room}` : null,
    sr.deliveryAddress.building ? `Building ${sr.deliveryAddress.building}` : null,
  ]
    .filter(Boolean)
    .join(', ')
  return {
    kind: 'user',
    recipientName: sr.contact.displayName,
    name2: room || null,
    address: sr.deliveryAddress,
  }
}

/**
 * `ship` is never posted to the generic action endpoint (SPEC_RESOLUTIONS #15): this dialog
 * creates the shipment with `POST /service-requests/{id}/shipments` and shows label + tracking.
 */
export function ShipDialog({
  entity: sr,
  open,
  onOpenChange,
  onDone,
}: ActionDialogProps<ServiceRequestDetail>) {
  const [created, setCreated] = useState<ShipmentCreated | null>(null)
  const hasOldItems = sr.items.some((item) => item.direction === 'collect')
  const packed = sr.items
    .filter((item) => item.direction === 'deliver')
    .every((item) => item.packedAt !== null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Create shipment · ${sr.number}`}
        description="Creates the carrier label and tracking numbers; the devices leave the hub."
        footer={
          created ? (
            <Button variant="primary" onClick={() => onDone(created.serviceRequest)}>
              Done
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )
        }
      >
        <div className="grid gap-3">
          {created ? (
            <ShipmentResult created={created} />
          ) : (
            <>
              <ShipToCard shipTo={shipToOf(sr)} />
              <ShipmentForm
                srId={sr.id}
                version={sr.version}
                hasOldItems={hasOldItems}
                ready={packed && sr.availableActions.includes('ship')}
                onCreated={setCreated}
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
