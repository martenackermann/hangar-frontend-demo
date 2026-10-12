import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/components/app/module-placeholder'
import { listSearchDefaults, listSearchSchema } from '@/lib/search/list-search'

/** PLACEHOLDER (phase 2a): demonstrates typed, URL-backed list search params. */
export const Route = createFileRoute('/imports/')({
  validateSearch: listSearchSchema,
  search: { middlewares: [stripSearchParams(listSearchDefaults)] },
  component: PlaceholderPage,
})

function PlaceholderPage() {
  const search = Route.useSearch()
  return (
    <ModulePlaceholder title="Imports" owner="slice H2 (Import & Master data)" search={search} />
  )
}
