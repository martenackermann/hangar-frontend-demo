import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/lib/auth/guards'
import { PipelinePage } from '@/modules/requests/components/pipeline/pipeline-page'
import { pipelineSearchSchema, type PipelineSearch } from '@/modules/requests/search'

/** Pipeline board (SCREENS.md §3.1). Owner: H1 (Requests & Comms). */
export const Route = createFileRoute('/_app/pipeline')({
  validateSearch: pipelineSearchSchema,
  beforeLoad: requirePermission('sr.read'),
  staticData: { title: 'Pipeline board' },
  component: PipelineRoute,
})

function PipelineRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <PipelinePage
      search={search}
      onSearch={(patch, replace) =>
        void navigate({ search: ((prev: PipelineSearch) => ({ ...prev, ...patch })) as never, replace })
      }
    />
  )
}
