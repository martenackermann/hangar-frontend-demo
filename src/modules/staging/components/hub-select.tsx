import { Select } from '@/components/ui/select'
import { useHubs } from '@/lib/api/core'

/** Hub selector shared by the warehouse screens (SCREENS.md §5). */
export function HubSelect({
  value,
  onChange,
  className,
}: {
  value: number | undefined
  onChange: (siteId: number) => void
  className?: string
}) {
  const hubs = useHubs()
  return (
    <Select
      label="Hub"
      prefix="Hub"
      value={value === undefined ? undefined : String(value)}
      onValueChange={(next) => onChange(Number(next))}
      options={hubs.map((hub) => ({ value: String(hub.id), label: hub.name }))}
      className={className}
    />
  )
}
