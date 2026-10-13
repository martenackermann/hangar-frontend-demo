import { createFileRoute } from '@tanstack/react-router'
import { useCallback } from 'react'
import { requirePermission } from '@/lib/auth/guards'
import { PipelinePage } from '@/modules/requests/components/pipeline/pipeline-page'
import { pipelineSearchSchema, type PipelineSearch } from '@/modules/requests/search'

/** Pipeline board (SCREENS.md §3.1). Owner: H1 (Requests & Comms). */
export const Route = createFileRoute('/_app/pipeline')({
  validateSearch: pipelineSearchSchema,
  beforeLoad: requirePermission('sr.read'),
  staticData: { title: 'Pipeline' },
  component: PipelineRoute,
})

/** The board's own params: opening a card (`?sr=`) must not re-render every column. */
function boardSearch(search: PipelineSearch): PipelineSearch {
  return {
    siteId: search.siteId,
    regionId: search.regionId,
    deliveryType: search.deliveryType,
    vip: search.vip,
    campus: search.campus,
    status: search.status,
    needsAttention: search.needsAttention,
    sort: search.sort,
    view: search.view,
  }
}

function PipelineRoute() {
  const search = Route.useSearch({ select: boardSearch, structuralSharing: true })
  const navigate = Route.useNavigate()
  const onSearch = useCallback(
    (patch: Partial<Record<keyof PipelineSearch, unknown>>, replace?: boolean) =>
      void navigate({
        search: ((prev: PipelineSearch) => ({ ...prev, ...patch })) as never,
        replace,
      }),
    [navigate],
  )
  return <PipelinePage search={search} onSearch={onSearch} />
}
