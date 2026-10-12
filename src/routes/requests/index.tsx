import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/components/app/module-placeholder'
import { listSearchDefaults, listSearchSchema } from '@/lib/search/list-search'

/** PLACEHOLDER (phase 2a): demonstrates typed, URL-backed list search params. */
export const Route = createFileRoute('/requests/')({
  validateSearch: listSearchSchema,
  search: { middlewares: [stripSearchParams(listSearchDefaults)] },
  component: PlaceholderPage,
})

function PlaceholderPage() {
  const search = Route.useSearch()
  return <ModulePlaceholder title="Requests" owner="slice H1 (Requests & Comms)" search={search} />
}
