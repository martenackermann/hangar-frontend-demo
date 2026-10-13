import { useMutation } from '@tanstack/react-query'
import { CircleCheck, CircleX, FlaskConical } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FlagBadge } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { Field, Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { ProcurementType, RegionResolutionResult } from '@/lib/api/types'
import { enumLabel, useEnums } from '@/lib/enums'
import { cn } from '@/lib/utils'
import { testRegionRules } from '../api'

/**
 * "Test an address" (SCREENS.md §9.2): zip, city, cost centre, procurement type →
 * `POST /region-rules/test` → region, winning rule, delivery type, campus, ranked candidates.
 */
const PROCUREMENT: ProcurementType[] = ['replacement', 'new_hire', 'additional_device', 'removal']

export function RuleTester({
  onOpenRegion,
  className,
}: {
  onOpenRegion: (id: number) => void
  className?: string
}) {
  const enums = useEnums()
  const [zip, setZip] = useState('')
  const [city, setCity] = useState('')
  const [costCenter, setCostCenter] = useState('')
  const [procurement, setProcurement] = useState<ProcurementType | 'any'>('any')
  const test = useMutation({
    mutationFn: () =>
      testRegionRules({
        zip: zip.trim() || undefined,
        city: city.trim() || undefined,
        costCenter: costCenter.trim() || undefined,
        procurementType: procurement === 'any' ? undefined : procurement,
      }),
  })
  const result: RegionResolutionResult | undefined = test.data

  return (
    <section
      aria-labelledby="tester-title"
      className={cn(
        'grid content-start gap-3 border-l border-line bg-surface px-4 py-3',
        className,
      )}
    >
      <h2 id="tester-title" className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon icon={FlaskConical} size={14} className="text-fg-3" /> Test an address
      </h2>
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          test.mutate()
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <Field label="Zip">
            {({ id }) => (
              <Input
                id={id}
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                className="font-mono"
              />
            )}
          </Field>
          <Field label="City">
            {({ id }) => <Input id={id} value={city} onChange={(e) => setCity(e.target.value)} />}
          </Field>
          <Field label="Cost centre">
            {({ id }) => (
              <Input
                id={id}
                value={costCenter}
                onChange={(e) => setCostCenter(e.target.value)}
                className="font-mono"
              />
            )}
          </Field>
          <Field label="Procurement">
            {({ id }) => (
              <Select<ProcurementType | 'any'>
                id={id}
                value={procurement}
                onValueChange={setProcurement}
                options={[
                  { value: 'any', label: 'Any' },
                  ...PROCUREMENT.map((value) => ({
                    value,
                    label: enumLabel(enums, 'procurementType', value),
                  })),
                ]}
              />
            )}
          </Field>
        </div>
        <Button type="submit" size="sm" loading={test.isPending} className="justify-self-start">
          Resolve
        </Button>
      </form>
      {result && (
        <div className="grid gap-2 text-sm" aria-live="polite">
          {result.resolved && result.region ? (
            <p className="flex flex-wrap items-center gap-1.5">
              <Icon icon={CircleCheck} size={14} className="text-tone-done" />
              <button
                type="button"
                className="font-medium text-accent-text hover:underline"
                onClick={() => result.region && onOpenRegion(result.region.id)}
              >
                {result.region.name}
              </button>
              <span className="text-fg-2">
                · {result.deliveryType ? enumLabel(enums, 'deliveryType', result.deliveryType) : ''}
                {result.supplyingSite ? ` · ${result.supplyingSite.name}` : ''}
              </span>
              {result.isCampus && <FlagBadge>Campus</FlagBadge>}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-tone-critical-fg">
              <Icon icon={CircleX} size={14} /> No rule matches — the request would stay unresolved.
            </p>
          )}
          <p className="font-mono text-2xs text-fg-3">
            normalized: zip {result.normalizedInput.zip ?? '—'} · city{' '}
            {result.normalizedInput.city ?? '—'} · cost centre{' '}
            {result.normalizedInput.costCenter ?? '—'}
          </p>
          {result.candidates.length > 0 && (
            <ol className="grid gap-1">
              {result.candidates.map(({ rule, rank }) => (
                <li
                  key={rule.id}
                  className={cn(
                    'grid grid-cols-[auto_1fr] gap-x-2 rounded-xs px-2 py-1 text-xs',
                    rank === 1 ? 'bg-tone-done-wash' : 'bg-sunken',
                  )}
                >
                  <span className="font-mono text-fg-3">#{rank}</span>
                  <span>
                    {enumLabel(enums, 'regionRuleMatchKind', rule.matchKind)}{' '}
                    <span className="font-mono">{rule.normalizedPattern}</span> → {rule.region.name}
                    {rule.procurementType
                      ? ` · ${enumLabel(enums, 'procurementType', rule.procurementType)} only`
                      : ''}
                    {rule.priority ? ` · priority ${rule.priority}` : ''}
                    {rule.isCampus ? ' · campus' : ''}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  )
}
