import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { IdInk } from '@/components/domain/status'
import { Icon } from '@/components/ui/icon'
import { KeyValue, KeyValues, SectionHeading } from '@/components/ui/page'
import type { ServiceRequestDetail } from '@/lib/api/types'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatDateTime } from '@/lib/format'
import { ChecklistEditor } from '@/modules/staging/components/checklist-editor'

/** SR drawer tab "Staging" (SCREENS.md §1.5, order 6): editor, options, checklist, devices. */
export function StagingTab({ entity: sr }: { entity: ServiceRequestDetail }) {
  const enums = useEnums()
  const devices = sr.items.filter((item) => item.direction === 'deliver')
  const inQueue = sr.status === 'appointment_booked' || sr.status === 'personalization_in_progress'
  return (
    <div className="grid gap-1">
      <KeyValues>
        <KeyValue label="Editor">{sr.editor?.displayName}</KeyValue>
        <KeyValue label="Claimed">{sr.claimedAt ? formatDateTime(sr.claimedAt) : null}</KeyValue>
        <KeyValue label="OS reinstall">
          {sr.osReinstall ? enumLabel(enums, 'osReinstallTiming', sr.osReinstall) : 'None'}
        </KeyValue>
        <KeyValue label="Preparation">
          {sr.withoutAssetPrep ? 'Skipped (without asset preparation)' : 'Standard'}
        </KeyValue>
        <KeyValue label="Personalized">
          {sr.milestones.personalizedAt ? formatDateTime(sr.milestones.personalizedAt) : null}
        </KeyValue>
        <KeyValue label="Order closed">
          {sr.milestones.orderClosedAt ? formatDateTime(sr.milestones.orderClosedAt) : null}
        </KeyValue>
      </KeyValues>

      <SectionHeading>Assigned devices</SectionHeading>
      {devices.length === 0 ? (
        <p className="text-sm text-fg-3">No new devices on this request.</p>
      ) : (
        <table className="w-full text-sm" aria-label="Assigned devices">
          <thead className="text-left text-xs text-fg-3">
            <tr>
              <th className="py-1 font-medium">Slot</th>
              <th className="py-1 font-medium">Device</th>
              <th className="py-1 font-medium">Asset</th>
              <th className="py-1 font-medium">Location · place</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((item) => (
              <tr key={item.slot} className="border-t border-line-subtle">
                <td className="py-1.5 text-fg-2">{enumLabel(enums, 'itemSlot', item.slot)}</td>
                <td className="py-1.5">{item.asset?.article?.name ?? item.requestedType}</td>
                <td className="py-1.5">
                  {item.asset ? (
                    <IdInk value={item.asset.assetTag ?? item.asset.serialNumber} />
                  ) : (
                    <span className="text-fg-3">Not assigned</span>
                  )}
                </td>
                <td className="py-1.5 text-fg-2">
                  {item.asset ? (
                    <>
                      {item.asset.location.name}
                      {item.asset.installationPlace && (
                        <span className="hg-mono"> · {item.asset.installationPlace}</span>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SectionHeading>Software checklist</SectionHeading>
      <ChecklistEditor srId={sr.id} editable={false} />

      {inQueue && sr.supplyingSite && (
        <p className="mt-3 text-sm">
          <Link
            to="/warehouse/personalization"
            search={{
              siteId: sr.supplyingSite.id,
              queue: sr.status === 'appointment_booked' ? 'unclaimed' : 'all',
              selected: sr.id,
            }}
            className="inline-flex items-center gap-1 text-accent-text hover:underline"
          >
            Open in Personalization <Icon icon={ArrowUpRight} size={14} />
          </Link>
        </p>
      )}
    </div>
  )
}
