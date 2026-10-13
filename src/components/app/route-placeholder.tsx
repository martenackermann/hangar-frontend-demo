import { Construction } from 'lucide-react'
import { Page, PageHeader } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/feedback'

const OWNERS: Record<string, string> = {
  H1: 'H1 · Requests & Comms',
  H2: 'H2 · Import & Master data',
  H3: 'H3 · Staging & Fulfilment',
  H4: 'H4 · Field service',
  H5: 'H5 · Stock, Inventory & Dashboard',
}

/** Placeholder body of a route file until its slice replaces it (SCREENS.md §0 "Owner"). */
export function RoutePlaceholder({
  title,
  owner,
  purpose,
}: {
  title: string
  owner: string
  purpose: string
}) {
  return (
    <Page>
      <PageHeader title={title} />
      <div
        className="grid flex-1 place-items-center border-t border-line bg-surface"
        data-testid="route-placeholder"
      >
        <EmptyState icon={Construction} title={`This screen is being built by ${owner}`}>
          {purpose} <span className="text-fg-3">({OWNERS[owner] ?? owner})</span>
        </EmptyState>
      </div>
    </Page>
  )
}
