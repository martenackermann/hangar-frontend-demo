import { useQuery } from '@tanstack/react-query'
import { createFileRoute, stripSearchParams, useNavigate } from '@tanstack/react-router'
import { Package, Plus } from 'lucide-react'
import { z } from 'zod'
import { ColumnChooser } from '@/components/data-table/column-chooser'
import { DataTable, type DataColumn } from '@/components/data-table/data-table'
import { FilterBar, type FilterDef } from '@/components/data-table/filter-bar'
import { useTableColumns } from '@/components/data-table/use-table-columns'
import { DrawerFrame } from '@/components/drawer/drawer-frame'
import { Button } from '@/components/ui/button'
import { EmptyState, FlagBadge } from '@/components/ui/feedback'
import { Page, PageHeader } from '@/components/ui/page'
import type { Article, ArticleCategory } from '@/lib/api/types'
import { requirePermission } from '@/lib/auth/guards'
import { useCan } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatNumber } from '@/lib/format'
import { enumParam, listParam, listSearchDefaults, listSearchSchema } from '@/lib/search/params'
import { useShortcut } from '@/lib/shortcuts'
import { articleQueries } from '@/modules/imports/api'
import { ArticleEditor } from '@/modules/imports/components/article-editor'

/** Admin › Articles (SCREENS.md §9.1). Owner: H2 (Import & Master data). */
const CATEGORIES = [
  'laptop',
  'desktop',
  'tablet',
  'docking_station',
  'monitor',
  'headset',
  'keyboard',
  'mouse',
  'webcam',
  'bag',
  'accessory',
] as const satisfies readonly ArticleCategory[]

const searchSchema = listSearchSchema.extend({
  category: listParam(CATEGORIES),
  active: enumParam(['true', 'false', 'all']),
  /** Drawer: article id, or `new`. */
  article: z
    .union([z.literal('new'), z.coerce.number().int().positive()])
    .optional()
    .catch(undefined),
})

export const Route = createFileRoute('/_app/admin/articles')({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(listSearchDefaults)] },
  beforeLoad: requirePermission('master.read'),
  staticData: { title: 'Articles' },
  component: ArticlesPage,
})

function ArticlesPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const enums = useEnums()
  const canManage = useCan('master.manage')
  const patch = (p: Record<string, unknown>) =>
    void navigate({ search: (prev) => ({ ...prev, ...p }) })
  const query = useQuery(
    articleQueries.list({
      q: search.q,
      category: search.category,
      active: search.active,
      page: search.page,
      perPage: search.perPage,
      sort: search.sort,
    }),
  )
  useShortcut('n', () => patch({ article: 'new' }), {
    enabled: canManage && search.article === undefined,
    description: 'New article',
    group: 'Page',
  })

  const columns: DataColumn<Article>[] = [
    {
      id: 'number',
      header: 'Number',
      sortField: 'number',
      width: 110,
      locked: true,
      pinned: true,
      cell: (row) => <span className="font-mono">{row.number}</span>,
    },
    {
      id: 'name',
      header: 'Name',
      sortField: 'name',
      width: 230,
      title: (row) => row.name,
      cell: (row) => <span className="truncate">{row.name}</span>,
    },
    {
      id: 'modelNumber',
      header: 'Model number',
      width: 160,
      cell: (row) => <span className="truncate font-mono text-xs">{row.modelNumber}</span>,
    },
    {
      id: 'internalDescription',
      header: 'Device type',
      sortField: 'internalDescription',
      width: 220,
      title: (row) => row.internalDescription,
      cell: (row) => <span className="truncate">{row.internalDescription}</span>,
    },
    {
      id: 'category',
      header: 'Category',
      sortField: 'category',
      width: 140,
      cell: (row) => enumLabel(enums, 'articleCategory', row.category),
    },
    {
      id: 'manufacturer',
      header: 'Manufacturer',
      width: 150,
      cell: (row) => <span className="truncate">{row.manufacturer}</span>,
    },
    {
      id: 'weightKg',
      header: 'Weight',
      width: 80,
      align: 'end',
      cell: (row) => <span className="font-mono">{row.weightKg.toFixed(2)} kg</span>,
    },
    {
      id: 'active',
      header: 'Active',
      width: 90,
      cell: (row) =>
        row.isActive ? <span className="text-fg-2">Active</span> : <FlagBadge>Inactive</FlagBadge>,
    },
    {
      id: 'assetCount',
      header: 'Assets',
      width: 80,
      align: 'end',
      cell: (row) => <span className="font-mono">{formatNumber(row.assetCount)}</span>,
    },
    {
      id: 'openDemand',
      header: 'Open demand',
      width: 110,
      align: 'end',
      cell: (row) => <span className="font-mono">{formatNumber(row.openDemand)}</span>,
    },
  ]
  const cols = useTableColumns('articles', columns)
  const filters: FilterDef[] = [
    {
      kind: 'multi',
      key: 'category',
      label: 'Category',
      options: CATEGORIES.map((value) => ({
        value,
        label: enumLabel(enums, 'articleCategory', value),
      })),
    },
    {
      kind: 'single',
      key: 'active',
      label: 'Active',
      options: [
        { value: 'true', label: 'Active' },
        { value: 'false', label: 'Inactive' },
        { value: 'all', label: 'All' },
      ],
    },
  ]
  const rows = query.data?.data ?? []
  const selected = typeof search.article === 'number' ? search.article : null
  const openArticle = search.article !== undefined
  // the drawer may show an article that is not on the current list page
  const openDetail = useQuery({
    ...articleQueries.detail(selected ?? 0),
    enabled: selected !== null,
  })
  const openSummary = openDetail.data ?? rows.find((a) => a.id === selected)
  const label = search.article === 'new' ? 'New article' : (openSummary?.name ?? 'Article')
  const newButton = canManage ? (
    <Button variant="primary" icon={Plus} shortcut="n" onClick={() => patch({ article: 'new' })}>
      New article
    </Button>
  ) : null

  return (
    <Page>
      <PageHeader
        title="Articles"
        meta={
          query.data
            ? `${formatNumber(query.data.meta.total)} articles · device catalogue`
            : undefined
        }
        actions={newButton}
      />
      <FilterBar
        search={search}
        onSearchChange={patch}
        filters={filters}
        searchPlaceholder="Filter by number, name, model, device type…"
        resultCount={query.data?.meta.total}
        end={
          <ColumnChooser
            columns={columns}
            prefs={cols.prefs}
            onChange={cols.setPrefs}
            onReset={cols.reset}
          />
        }
      />
      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DataTable
            label="Articles"
            columns={columns}
            columnPrefs={cols.prefs}
            rows={rows}
            getRowId={(row) => String(row.id)}
            total={query.data?.meta.total}
            loading={query.isPending}
            fetching={query.isPlaceholderData}
            error={query.error}
            onRetry={() => void query.refetch()}
            sort={search.sort ?? 'number'}
            onSortChange={(sort) => patch({ sort, page: 1 })}
            activeId={selected ? String(selected) : null}
            onOpen={(row) => patch({ article: row.id })}
            pagination={{
              page: search.page,
              perPage: search.perPage,
              total: query.data?.meta.total ?? 0,
              onPageChange: (page) => patch({ page }),
              onPerPageChange: (perPage) => patch({ perPage, page: 1 }),
            }}
            empty={
              <EmptyState icon={Package} title="No articles" actions={newButton}>
                Add the device models you roll out.
              </EmptyState>
            }
          />
        </div>
        {openArticle && (
          <DrawerFrame
            label={label}
            onClose={() => patch({ article: undefined })}
            head={
              <div className="grid gap-0.5">
                <h2 className="text-lg font-semibold">{label}</h2>
                {openSummary && <p className="font-mono text-xs text-fg-3">{openSummary.number}</p>}
              </div>
            }
          >
            <ArticleEditor id={selected} onCreated={(article) => patch({ article: article.id })} />
          </DrawerFrame>
        )}
      </div>
    </Page>
  )
}
