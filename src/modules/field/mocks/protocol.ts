import { formatFullDateTime } from '@/lib/format'
import { articleRef, displayName, itemsOf, userRef } from '@/mocks/core/read-models'
import { db } from '@/mocks/db'
import { simplePdf } from '@/mocks/files'
import { isNewSlot } from './model'

const SLOT_LABEL: Record<string, string> = {
  new_base: 'New base device',
  new_peripheral_1: 'New peripheral 1',
  new_peripheral_2: 'New peripheral 2',
  old_base: 'Old base device',
  old_peripheral_1: 'Old peripheral 1',
  old_peripheral_2: 'Old peripheral 2',
}

/**
 * Demo version of the handover protocol (SPEC §6.11): two A4 pages - data deletion consent for
 * the collected old devices, hardware receipt for the delivered new devices.
 */
export function protocolPdf(srId: number): Uint8Array {
  const sr = db.collection('service_requests').get(srId)
  if (!sr) return simplePdf([{ title: 'Handover protocol', lines: ['Unknown request.'] }])
  const contact = db.collection('contacts').get(sr.contactId)
  const completion = db
    .collection('status_transitions')
    .filter(
      (t) =>
        t.entityType === 'service_request' &&
        t.entityId === sr.id &&
        ['complete_deployment', 'complete_manually'].includes(t.action),
    )
    .at(-1)
  const recipient =
    typeof completion?.payload?.recipientName === 'string'
      ? completion.payload.recipientName
      : contact
        ? displayName(contact)
        : 'Recipient'
  const technician = userRef(completion?.actorUserId)?.displayName ?? 'Field technician'
  const user = contact ? `${displayName(contact)} (${contact.userId})` : '-'
  const items = itemsOf(sr.id)
  const assetOf = (id: number | null) => (id ? db.collection('assets').get(id) : undefined)
  const collected = items
    .filter((i) => !isNewSlot(i.slot) && i.verifiedAt && i.assetId)
    .map((i) => {
      const asset = assetOf(i.assetId)
      return `${SLOT_LABEL[i.slot] ?? i.slot}: ${asset?.assetTag ?? '-'} / ${asset?.serialNumber ?? ''} / ${articleRef(asset?.articleId)?.name ?? asset?.model ?? 'Device'}`
    })
  const delivered = items
    .filter((i) => isNewSlot(i.slot) && i.assetId)
    .map((i) => {
      const asset = assetOf(i.assetId)
      return `${SLOT_LABEL[i.slot] ?? i.slot}: ${articleRef(asset?.articleId)?.name ?? i.requestedType ?? 'Device'} / ${asset?.assetTag ?? '-'} / ${asset?.serialNumber ?? ''}`
    })
  const deviation = sr.deviationCodeId
    ? db.collection('deviation_codes').get(sr.deviationCodeId)
    : undefined
  const header = [
    'Acme IT Services / hardware rollout on behalf of Globex Fleet AG (client)',
    `Service request: ${sr.number}   Task: ${sr.taskNumber ?? '-'}`,
    `User: ${user}`,
    `Date: ${formatFullDateTime(sr.completedAt ?? new Date())}`,
    '',
  ]
  return simplePdf([
    {
      title: 'Data deletion consent (old devices)',
      lines: [
        ...header,
        'Collected devices:',
        ...(collected.length ? collected : ['No old devices collected.']),
        '',
        'I confirm that my personal data on the devices listed above has been backed up or is',
        'no longer needed. I agree that Acme IT Services securely wipes these devices on behalf',
        'of Globex Fleet AG before they leave the fleet.',
        ...(sr.osReinstall === 'on_pickup'
          ? ['', 'OS reinstall on pickup: the old device is wiped and reinstalled when collected.']
          : []),
        '',
        '',
        `________________________________          ________________________________`,
        `User: ${contact ? displayName(contact) : '-'}                Technician: ${technician}`,
        '',
        'Demo document / page 1 of 2',
      ],
    },
    {
      title: 'Hardware receipt',
      lines: [
        ...header,
        'Delivered devices:',
        ...(delivered.length ? delivered : ['No new devices delivered.']),
        '',
        `Installed software: ${sr.installedSoftware.length ? sr.installedSoftware.join(', ') : 'none'}`,
        ...(deviation
          ? [
              `Deviation: ${deviation.code} ${deviation.label}${sr.deviationComment ? ` / ${sr.deviationComment}` : ''}`,
            ]
          : []),
        '',
        `Recipient: ${recipient}`,
        `Technician: ${technician}`,
        `Completed: ${formatFullDateTime(sr.completedAt ?? new Date())}`,
        '',
        '',
        `________________________________          ________________________________`,
        `Recipient: ${recipient}                Technician: ${technician}`,
        '',
        'Demo document / page 2 of 2',
      ],
    },
  ])
}
