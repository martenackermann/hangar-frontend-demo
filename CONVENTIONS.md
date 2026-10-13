# Hangar frontend conventions

How this codebase is organised and how to build on it. Read it completely before you start a
slice.

**Source of truth.** The product spec lives in `_spec/hangar/`: `SPEC.md`, `API.md`,
`SCREENS.md`, `DESIGN.md`, `tokens.css` and the comps. **`SPEC_RESOLUTIONS.md` takes
precedence over all of them**: where it differs, it wins. Spec names win over the comps
(persona names, asset tags `GX…`, copy).

Slices: **H1** Requests & Comms (`requests`), **H2** Import & Master data (`imports`), **H3**
Staging & Fulfilment (`staging`), **H4** Field service (`field`), **H5** Stock, Inventory &
Dashboard (`stock`).

---

## 1. Ground rules for slices

1. **Stay in your lane.** A slice creates and edits only:
   - `src/modules/<its module>/**`
   - the route files SCREENS.md assigns to it under `src/routes/_app/**` (each placeholder
     says `Owner: H‹n›`), plus new child routes next to them
   - `e2e/<module>-*.spec.ts`

   Anything else is a **shared-file request** in your final report (what, where, why).

2. **Never touch** (foundation-owned): `src/lib/**`, `src/components/**`, `src/mocks/*.ts`,
   `src/mocks/core/**`, `src/mocks/fixtures/**`, `src/test/**`, `src/routes/__root.tsx`,
   `src/routes/_app.tsx`, `src/routes/login.tsx`, `src/routes/_app/index.tsx`,
   `src/routes/_app/$.tsx`, `src/styles/**`, `src/main.tsx`, `src/app.tsx`, `src/router.tsx`,
   configs (`vite`, `vitest`, `playwright`, `eslint`, `tsconfig*`, `package.json`, `pnpm-*`),
   `public/**`, `scripts/**`, `e2e/fixtures.ts`, and other slices' files.
3. **Generated files are never hand-edited**: `src/routeTree.gen.ts` (`pnpm routes:gen`),
   `src/lib/api/schema.d.ts` (`pnpm api:types`), `public/mockServiceWorker.js`,
   `src/mocks/fixtures/seed.json` (`pnpm seed:import`).
4. **No new dependencies.** Everything a slice needs is installed. If something is missing,
   report it.
5. Before handing back, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build:demo` and
   `pnpm test:e2e` must pass.
6. Fictional universe only: Acme IT Services (operator), Globex Fleet AG (client), Initech
   Logistics (carrier); hubs Riverton, Hillford, Eastgate + Campus. Emails `@example.com`,
   URLs `example.com`/`localhost`, no real people, addresses or phone numbers.

## 2. Commands

| Command                          | What it does                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm dev:demo`                  | Dev server on :5173 with the MSW mock API and in-browser database. No backend needed.                  |
| `pnpm dev`                       | Dev server against the real API (`VITE_API_URL`, default `http://localhost:8100/api/v1`).              |
| `pnpm build` / `pnpm build:demo` | Route gen + `tsc -b` + production build (the demo build is what Vercel deploys).                       |
| `pnpm lint` / `pnpm format`      | ESLint (zero warnings) + Prettier check / auto-fix.                                                    |
| `pnpm typecheck`                 | Route gen + `tsc -b --noEmit`.                                                                         |
| `pnpm test` / `pnpm test:watch`  | Vitest (jsdom, MSW node server, demo DB from `seed.json`).                                             |
| `pnpm test:e2e`                  | Playwright (Chromium) against `pnpm dev:demo`; `E2E_BASE_URL=…` targets a running server.              |
| `pnpm screenshots`               | Regenerates the README set in `docs/screenshots/` (`e2e/screenshots.spec.ts`). Not part of `test:e2e`. |
| `pnpm routes:gen`                | Regenerate `src/routeTree.gen.ts`.                                                                     |
| `pnpm api:types`                 | Regenerate `src/lib/api/schema.d.ts` from `../hangar-backend-demo/openapi.json`.                       |
| `pnpm seed:handmade`             | Fallback only: write the old hand-made `seed.json` (when the backend is unavailable).                  |
| `pnpm seed:import`               | Replace `seed.json` with the backend export (`uv run hangar seed --export-json`, needs its DB).        |
| `pnpm icons:gen`                 | Render the PWA icons from `public/icon.svg`.                                                           |

All demo personas use the password `demo1234`. It is a demo value, not a real credential.

## 3. Layout

```
src/
  main.tsx, app.tsx, router.tsx   bootstrap, providers, router + query client
  routes/
    __root.tsx                    providers, toasts, devtools
    login.tsx                     persona picker + email login
    _app.tsx                      authenticated shell layout (loads /me, /meta/config, /meta/enums)
    _app/…                        every SCREENS.md screen (placeholders until a slice replaces them)
  modules/<module>/               slice code (§4)
  components/
    ui/                           UI kit (buttons, inputs, dialogs, menus, date picker, toasts…)
    data-table/                   DataTable, FilterBar, saved views, column chooser, bulk bar
    drawer/                       drawer frame + SR / lease / asset drawers, workflow action bar
    scan/                         ScanStation, ScanInput, verdict banner, scan list, camera
    domain/                       StatusBadge, StageTrack, AgingIndicator, PipelineBoard, StatTile…
    app/                          shell: rail, top bar, ⌘K, shortcut help, persona switcher, errors
  lib/                            api/, auth/, enums/, format/, nav/, prefs/, query/, registry/,
                                  scan/, search/, shortcuts/, forms/, jobs.tsx
  mocks/                          mock API: db, workflow engine, http/list helpers, core handlers
  styles/                         tokens.css (copy of the spec), app.css (Tailwind theme)
  test/                           Vitest setup + render helpers
e2e/                              Playwright specs (fixtures.ts: personas + signIn)
scripts/                          icons, seed fixture generator, seed import
```

File names are `kebab-case`. Import with the `@/` alias, never with `../../`.

## 4. How to build a slice (recipe)

### 4.1 Your module folder

```
src/modules/<module>/
  nav.ts                   export const nav: NavEntry[]                 (pre-filled from SCREENS §1.2)
  api.ts                   public surface: keys, queryOptions, mutation hooks, types
  commands.ts              export const commands: CommandDescriptor[]   (⌘K actions)
  components/, hooks/      private UI and hooks
  sr-drawer-tabs/*.tsx     default export DrawerTabDescriptor<ServiceRequestDetail>
  lease-drawer-tabs/*.tsx  default export DrawerTabDescriptor<LeaseReturnDetail>
  asset-drawer-tabs/*.tsx  default export DrawerTabDescriptor<AssetDetail>
  action-dialogs/*.tsx     default export ActionDialogDescriptor
  drawers/*.tsx            default export ParamDrawerDescriptor   (H1: the `?mail=` mail-log drawer)
  mocks/handlers.ts        export const handlers: RequestHandler[]
  mocks/workflow.ts        side effects: registerGuard / Effect / Resolver / Validator / Authorizer
  mocks/seed.ts            export const seed: SeedDefinition         (optional, slice tables)
```

Everything above is **collected automatically** with `import.meta.glob` over
`src/modules/{requests,imports,staging,field,stock}/…` (SPEC_RESOLUTIONS #19). You never
register anything in shared code: you create the file. Only create the folders you use.

**Boundaries (ESLint-enforced):** another module is reachable only through its `api.ts` or
`nav.ts`. A module's `mocks/` may import other modules' `mocks/` (one simulated backend).
Foundation code never imports a slice. If two slices need the same thing, file a shared-file
request.

### 4.2 Step by step

1. **Read** your screens in SCREENS.md, your endpoints in API.md, the SPEC sections and
   **every SPEC_RESOLUTIONS row that touches your area**.
2. **Mock first** (§10): `mocks/workflow.ts` for the guards and effects of your actions,
   `mocks/handlers.ts` for your endpoints, `mocks/seed.ts` for tables you own. Unit-test them.
3. **`api.ts`**: query keys (`createQueryKeys('<resource>')`) and `queryOptions` for your
   resources. Reuse `srKeys`/`leaseKeys`/`assetKeys` (`@/lib/api/keys`) and `detailQueries`
   (`@/lib/api/details`).
4. **Replace the placeholder route files** you own. Keep the path, the `beforeLoad` guard
   (change it only if SCREENS or #36 says so) and `staticData.title`. Add `validateSearch`
   for your URL params and drop the `RoutePlaceholder` import.
5. **Build the screen** from the kit (§7): `Page`/`PageHeader`, `FilterBar` +
   `SavedViewTabs` + `DataTable`, or `PipelineBoard`, or `ScanStation`. Open records in the
   shared drawers with `useDrawerNavigation().open('sr', id)`.
6. **Drawer content**: add tabs (`sr-drawer-tabs/…`) and action dialogs (`action-dialogs/…`)
   for your actions.
7. **⌘K**: add actions to `commands.ts`. `nav.ts` entries appear under "Go to" on their own.
8. **Tests**: Vitest next to your code (handlers, guards, components) and one Playwright spec
   `e2e/<module>-*.spec.ts` per main flow and persona.

### 4.3 A list screen

```tsx
// src/routes/_app/service-requests.tsx (H1)
const searchSchema = listSearchSchema.extend({
  status: listParam(SR_STATUSES), // ?status=invited,escalated
  regionId: idListParam({ allowNone: true }),
  vip: boolParam(),
})

export const Route = createFileRoute('/_app/service-requests')({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(listSearchDefaults)] },
  beforeLoad: requirePermission('sr.read'),
  staticData: { title: 'Service requests' },
  component: ServiceRequestsPage,
})

function ServiceRequestsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const patch = (p: Record<string, unknown>) =>
    void navigate({ search: (prev) => ({ ...prev, ...p }) })
  const query = useQuery(srListQuery(search)) // from your api.ts, with keepPreviousData
  const cols = useTableColumns('service-requests', columns)
  const views = useSavedViews({
    route: '/service-requests',
    builtIns: BUILT_IN_VIEWS,
    search,
    defaults: listSearchDefaults,
  })
  const drawer = useDrawerNavigation()
  const { sr } = useDrawerSearch()
  const [selected, setSelected] = useState<string[]>([])
  useDrawerSiblings('sr', query.data?.data.map((row) => row.id) ?? [])

  return (
    <Page>
      <PageHeader title="Service requests" meta="1,284 open · Globex Fleet AG" />
      <SavedViewTabs views={views} onApply={(next) => void navigate({ search: next })} />
      <FilterBar
        search={search}
        onSearchChange={patch}
        filters={FILTERS}
        searchPlaceholder="Filter by SR, name, asset tag…"
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
      <DataTable
        label="Service requests"
        columns={columns}
        columnPrefs={cols.prefs}
        rows={query.data?.data ?? []}
        getRowId={(row) => String(row.id)}
        total={query.data?.meta.total}
        loading={query.isPending}
        fetching={query.isPlaceholderData}
        error={query.error}
        onRetry={() => void query.refetch()}
        sort={search.sort}
        onSortChange={(sort) => patch({ sort, page: 1 })}
        selectable
        selectedIds={selected}
        onSelectedIdsChange={setSelected}
        activeId={sr ? String(sr) : null}
        onOpen={(row) => drawer.open('sr', row.id)}
        pagination={{
          page: search.page,
          perPage: search.perPage,
          total: query.data?.meta.total ?? 0,
          onPageChange: (page) => patch({ page }),
          onPerPageChange: (perPage) => patch({ perPage, page: 1 }),
        }}
        empty={<EmptyState icon={Inbox} title="No requests match these filters." />}
      />
      <BulkActionBar count={selected.length} onClear={() => setSelected([])}>
        …
      </BulkActionBar>
    </Page>
  )
}
```

`DataColumn<T>` is `{ id, header, cell, sortField?, width?, align?, defaultHidden?, locked?,
pinned?, title? }`. A column is sortable when it has `sortField` (the API field). The table
owns keyboard handling (`j`/`k`, `x`, `shift+x`, `Enter`/`o`, `Esc`, `[`/`]`),
virtualization, skeletons, the empty state, the phone layout (`mobileRow`) and the pagination
footer. Only one table per screen registers shortcuts; pass `keyboard={false}` to the others.

`FilterDef` kinds: `multi`, `single`, `boolean`, `dateRange` (`fromKey`/`toKey`). The bar
writes comma lists, resets `page`, debounces `q`, and binds `f` (add filter) and `/` (search).
Bulk actions: `useBulkAction(resource)` posts to `/<resource>/bulk/{action}` and summarises the
`BulkResult` in a toast.

### 4.4 Drawer tabs and action dialogs

```tsx
// src/modules/staging/sr-drawer-tabs/personalization.tsx
const tab: DrawerTabDescriptor<ServiceRequestDetail> = {
  id: 'personalization',
  label: 'Personalization',
  order: 40,
  permission: 'sr.read',
  isVisible: (sr) => sr.stage !== 'imported',
  count: (sr) => sr.items.length,
  component: ({ entity }) => <PersonalizationTab sr={entity} />,
}
export default tab
```

Tab order follows the SCREENS §1.5 table. The core frames (`SrDrawer`, `LeaseDrawer`,
`AssetDrawer` and the `?mail=` host) render the header, `StageLine`, attention chips, the
action bar and your tabs. With no tab registered they show the core facts.

```tsx
// src/modules/requests/action-dialogs/pause-communication.tsx
const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'pause_communication',
  primary: true,
  order: 30,
  component: PauseCommunicationDialog, // ActionDialogProps<ServiceRequestDetail>
}
export default dialog
```

`WorkflowActionBar` (SPEC_RESOLUTIONS #15) renders `availableActions` plus `blockedActions`
(disabled, with the guard reason as tooltip): up to 3 primary buttons (dialogs marked
`primary`, otherwise the first 3 by `order`) and an overflow menu. An action with a registered
dialog opens it. Otherwise `requiresComment`/`destructive` actions open a `ConfirmDialog` and
the rest post directly. `ship` is never posted to the action endpoint: H3's dialog makes the
shipping call. Inside a dialog, call
`useWorkflowAction(resource, entity, label).mutateAsync({ action, body })`, then `onDone(updated)`.

### 4.5 Scan screens

```tsx
<ScanStation<InventoryScan>
  label="Scan serial or asset tag"
  submit={(serial) =>
    api.post<ScanResult<InventoryScan>>(`/inventories/${id}/scans`, { serial })
  }
  describe={(result) => …} // list row
  details={(result) => …} // banner extras
  context={<>Expected: …</>}
  aside={<ProgressMeter … />}
/>
```

The station owns the focus lock, Enter to submit, the 800 ms bounce, the FIFO queue (max 20),
the verdict banner with sound and vibration, the running list (All / Flagged), undo via
`ScanResult.undo` (`⌘Z`/`Ctrl+Z`), `F2` sound, `F3` camera (`createCodeDetector()`) and the
offline state. One verdict table applies (SPEC_RESOLUTIONS #25): ok → done/ok, warning →
caution/warn, error → critical/error. Business misses are verdicts in a 200 response, never
errors. Use `ScanInput` on its own only for single embedded fields.

## 5. Routing and URL state

- File-based TanStack Router. `_app` is the pathless authenticated layout. **A route's view
  rule is the permission of its primary GET** (SPEC_RESOLUTIONS #36): `beforeLoad:
requirePermission(...)` or `requireAnyPermission(...)`. A missing permission renders the 403
  page inside the shell, and an unknown path renders the 404 page inside the shell.
  Operational screens (warehouse included) are readable with `sr.read`; their action buttons
  are permission-gated.
- `staticData: { title }` feeds the breadcrumb and the document title.
- **All list state lives in the URL** (SCREENS §0): filters, sort, page, perPage, view and
  the drawer (`sr`, `lr`, `asset`, `mail`, `tab`). `_app.tsx` declares the drawer params once
  and every route inherits them.
- Codec (`@/lib/search/params`): multi-values are **comma-separated** (`?status=a,b`). The
  parser also accepts repeated keys and `key[]` (SPEC_RESOLUTIONS #39). Helpers:
  `stringParam`, `intParam`, `idParam`, `boolParam`, `dateParam`, `enumParam`, `listParam`,
  `idListParam({ allowNone })`, `pageParam`, `perPageParam`. `listSearchSchema` holds `q`,
  `sort`, `page` (1), `perPage` (25) and `view`. Invalid values fall back to defaults, and
  defaults are stripped (`stripSearchParams(listSearchDefaults)`). Reset `page` whenever a
  filter changes.
- **Saved views** (`useSavedViews`, `SavedViewTabs`) combine built-in views per screen (in
  code) with personal and shared views from `/saved-views`. A view stores the canonical
  filter/sort search; volatile keys (`page`, `view`, drawer params) are dropped. Editing
  filters shows "Modified · Save / Save as new / Reset".
- Column visibility, order and width are stored per user in localStorage
  (`useTableColumns`), not in the URL.

## 6. Data: API client, queries, mutations

- **Client** `@/lib/api/client`: `api.get/post/put/patch/delete/upload<T>(path, …)` sends the
  bearer token; `toQueryString` writes comma lists. `typedApi` + `unwrap` (openapi-fetch) use
  the generated `schema.d.ts` for the endpoints the backend already exports.
- **Types**: `@/lib/api/types` covers every API.md schema, written by hand (the backend
  `openapi.json` covered only a few paths when the foundation was built). It is the contract:
  prefer it over `schema.d.ts` until the backend covers your endpoints.
- **Envelope**: lists return `List<T> = { data: T[], meta: { page, perPage, total, totalPages } }`
  (SPEC_RESOLUTIONS #20). `/meta/*` and small lookups return `{ data }` without paging.
- **Errors**: every failure becomes an `ApiError` (`@/lib/api/errors`) with `status`, `code`
  (`ProblemCode`), `title`, `detail`, `fieldErrors` (dot paths), `guard`, `allowedActions` and
  `currentVersion`; `isVersionConflict(error)` tests for 409 version conflicts. Forms map
  422s with `applyServerErrors`. `notifyActionError` shows the standard toasts (409 version
  conflict → "This record changed. Reload").
- **Query keys**: one factory per API resource. `createQueryKeys('<resource>')` gives
  `all › lists() › list(params)`, `all › details() › detail(id)` and `scope(...)`. Shared keys:
  `srKeys`, `leaseKeys`, `assetKeys`, `contactKeys`, `mailKeys` (`@/lib/api/keys`),
  `coreKeys`/`coreQueries` (`@/lib/api/core`: me, config, enums, personas, sites, regions,
  stock locations, users, deviation codes, search, saved views, jobs) and `detailQueries`
  (`@/lib/api/details`) for the three drawers.
- **Invalidation**: declare it on the mutation, `meta: { invalidates: [srKeys.all] }`. The
  global `MutationCache` invalidates after success and keeps the mutation pending until the
  refetch completes. Anything that changes a service request (status, items, appointment,
  assets) invalidates `srKeys.all`. Asset moves invalidate `assetKeys.all`; stock-changing
  actions also invalidate your stock keys. `meta.successToast` sets a success toast;
  `meta.errorToast: false` turns off the global error toast when the UI shows the error itself.
- **Workflow resources** carry `version`, `availableActions` and `blockedActions:
{ action, guard, reason }[]` (SPEC_RESOLUTIONS #4). Never re-derive rules on the client.
  Action endpoint: `POST /<resource>/{id}/actions/{action}` with `{ version, comment?, … }`.
  Bulk endpoint: `POST /<resource>/bulk/{action}` → `BulkResult`. Labels and flags come from
  `/meta/enums.transitions` (`findTransition`, `actionLabel`).
- **Jobs**: `202 { jobId }` → `trackJob(queryClient, accepted, { title, invalidate, describe })`
  polls `/jobs/{id}` every second and moves the toast from loading to success or error.
- **Downloads**: `downloadFrom(() => api.post<DownloadLink>(…))` or `downloadGet(path)`
  (a blob in demo mode, `location.assign` against the backend).
- **Enums**: `useEnums()`, `enumLabel`, `enumTone`. Labels and tones always come from
  `/meta/enums`. `ENUM_CATALOG` is a static mirror (fallback, role permissions, personas); the
  mock serves the fixture's `enums`, i.e. the backend's own.
- **Dates**: shown in the business time zone from `/meta/config` (`@/lib/format`:
  `formatDate`, `formatDateTime`, `formatRelative`, `formatAge`, `businessToday`,
  `addWorkingDays`…).

## 7. UI kit

Use the kit and don't restyle primitives in slices. Use tokens only, never raw colours.

| Need          | Use                                                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page frame    | `Page`, `PageHeader`, `Toolbar`, `Panel`, `KeyValues`, `SectionHeading` (`ui/page`)                                                                               |
| Buttons       | `Button`, `IconButton` (`ui/button`), `Icon` (lucide), `Kbd`, `Spinner`                                                                                           |
| Inputs        | `Input`, `Textarea`, `SearchInput`, `Field` (`ui/input`), `Checkbox`, `Switch`, `Select`, `Combobox`, `DatePicker`, `DateRangePicker`, `SegmentedControl`         |
| Overlays      | `Dialog`/`DialogContent`, `ConfirmDialog` (comment + ⌘⏎), `Popover`, `Tooltip`, `DropdownMenu`                                                                    |
| Feedback      | `notify.success/error/warning/info/loading` (`ui/toast`), `EmptyState`, `Skeleton`, `SkeletonRows`, `Banner`, `ProgressMeter`, `ToneBadge`, `FlagBadge`, `Avatar` |
| Tables        | `DataTable`, `FilterBar`, `SavedViewTabs`, `ColumnChooser`, `BulkActionBar`/`BulkAction`, `DensityToggle`                                                         |
| Status        | `StatusBadge` (`entity` = enum key), `StageTrack`, `StageLine`, `AgingIndicator` (`STAGE_SLA_DAYS`, frontend constants per #56), `IdInk`, `CopyableId`, `VipFlag` |
| Boards, KPIs  | `PipelineBoard`, `PipelineColumn`, `ColumnHeader`, `PipelineCard`, `StatTile`, `Sparkline`, `KpiStrip`                                                            |
| Stock         | `StockHeatCell` (`orderQuantity = max(0, demand + buffer − stock)`, #18), `HeatLegend`                                                                            |
| Files/history | `FileDrop`, `ImportProgress` (completed with warnings → caution, #56), `Timeline`                                                                                 |
| Scanning      | `ScanStation`, `ScanInput`, `VerdictBanner`, `ScanList`, `CameraScanner`                                                                                          |
| Field         | `TechnicianShell`, `TourStation` (mobile frame for My tour)                                                                                                       |

Popovers, menus and tooltips render in a portal above the drawer (`z-[70]`) and set
`aria-expanded` on their trigger. Dialogs focus `[data-autofocus]` or the first field of
their body.

**Styling**: Tailwind v4 with the spec tokens as the theme (`bg-surface`, `bg-raised`,
`text-fg-2`, `border-line`, `h-row`, `px-cell`, `h-control`, `text-table`…). For tones,
`.hg-tone-<tone>` sets `--t`, `--t-fg` and `--t-wash` (`bg-(--t-wash)`). Dark is the default
theme. `data-theme` and `data-density` (`compact`/`comfortable`) sit on `<html>`; use the
`comfortable:` variant for density-specific spacing. Fonts: Archivo (variable, `wdth`) and
Atkinson Hyperlegible Mono (`.hg-mono`, `font-mono`) for IDs and numbers. Copy: English,
sentence case, no exclamation marks. Empty states are one sentence plus one hint.

## 8. Shortcuts and the shell

- `useShortcut(keys, handler, { description, group, enabled, allowInInput, allowInDialog })`
  registers a shortcut for the component's lifetime and lists it in the `?` overlay. Key
  syntax: `t`, `shift+x`, `mod+k` (⌘ on macOS, Ctrl elsewhere), sequences like `g p`.
  Shortcuts pause while the user types, inside modal dialogs (unless allowed) and when
  single-key shortcuts are switched off in the overlay. Enter and Space on a focused control
  belong to that control.
- Global keys: `⌘K` palette, `?` help, `T` theme, `D` density, `[` rail, `g …` navigation
  (from `nav.ts`). Lists and drawers come with their standard keys (SCREENS §1.4); add only
  screen-specific ones.
- ⌘K: exact-code jump (`SR…`, `GX…`, serials) via `/search`, recent records, "Go to" from the
  nav, module `commands`, personas (demo) and system commands (theme, density, reset demo data,
  log out).
- Nav entries (`nav.ts`): `{ id, label, to, group, icon, permission?, shortcut?, order?,
keywords? }`. Groups: Overview, Requests, Warehouse, Field (first for technicians), Stock,
  Data, Admin (shown only with `master.manage` or `users.manage`). A test checks that ids and
  shortcuts are unique.

## 9. Auth and permissions

- Personas (SPEC §11): Dana Dispatcher, Theo Technician, Vic Viewer, Ada Admin, plus more
  technicians. The login page offers persona cards (keys 1–4) and email/password. In demo
  mode the top bar has a persona switcher. Home: technicians go to `/field/my-tour`, everyone
  else to `/pipeline`.
- `@/lib/auth/store`: `useMe()`, `useCan(permission)`, `can()`, `getMe()`. Permissions are
  the exact SPEC §3.2 keys (`PermissionKey`). The server is the authority; the client only
  hides and disables.

## 10. Mock API (demo mode and tests)

Demo mode runs the whole product in the browser: MSW plus an in-memory database loaded from
`src/mocks/fixtures/seed.json` and persisted in IndexedDB (`hangar-demo`, records under
`hangar.demo-db.v4/…`). The same handlers run in Vitest. A screen that works in demo mode must work against the backend
unchanged: same shapes, same validation, same permissions.

- **Order**: slice handlers, then core handlers, then a 501 fallback. A slice can override a
  core endpoint by handling it first.
- **Database** (`@/mocks/db`): `db.collection('<table>')` with `all`, `get`, `find`, `filter`,
  `count`, `insert`, `insertMany`, `update(id, patch | fn)`, `upsert`, `remove`,
  `removeWhere`. Rows are snapshots, so never mutate them in place. The core tables (users,
  sites, regions, stock_locations, articles, assets, asset_movements,
  service_requests(+items), lease_returns(+comments), status_transitions, contacts,
  vip_entries, deviation_codes, booking_calendars, saved_views…) come from `seed.json` as raw
  rows (SPEC_RESOLUTIONS #16).
- **Slice tables**: declare them by module augmentation in your `mocks/seed.ts` and seed them
  deterministically from the core rows:

  ```ts
  declare module '@/mocks/db' {
    interface DemoCollections {
      tours: TourRow
      tour_stops: TourStopRow
    }
  }
  export const seed: SeedDefinition = {
    module: 'field',
    version: 1,
    order: 40,
    run: ({ db, faker, today, fixture }) => {
      db.collection('tours').insertMany(…)
    },
  }
  ```

  Take every random value from `faker` (seeded per module) and every date from `today` (the
  business date). Never use `Math.random()` or `new Date()` in seeds. Bump `version` when your
  data changes. If the backend export carries your tables, read them from `fixture.tables`.

- **Dates shift** to today by whole weeks on load (SPEC_RESOLUTIONS #47), so weekdays and
  "today's tour" stay stable. "Reset demo data" (⌘K, admin) reloads the fixture.
- **Persistence** (`src/mocks/persistence.ts`, `idb-storage.ts`): every collection change marks
  its rows dirty; a save writes only the changed 64-row buckets (plus the id list when rows were
  added or removed) and a meta record, in one IndexedDB transaction. Mutating requests answer
  only after their save is written, and `pagehide` flushes the rest, so a reload never loses a
  change. A restored database needs neither `seed.json` nor faker (both load only to seed or
  reset); a new fixture or seed `version` reseeds. Rows are frozen in dev and tests: mutate
  them only through the collection API, or the change is not saved.
- **Workflow engine** (`@/mocks/workflow`): the SR, lease and asset transition maps are
  defined once: the fixture's `enums.transitions` (exported by the backend), served as
  `/meta/enums.transitions` and read through `servedEnums()`. `internal` actions (import, sync,
  system) are never offered to users; `viaEndpoint: false` actions (`ship`) are offered but
  executed by their dedicated endpoint. Core
  registers the rules that touch core tables (`src/mocks/core/workflow.ts`); slices register
  theirs in `mocks/workflow.ts`:

  ```ts
  registerGuard('serviceRequest', 'close_order', ({ row }) =>
    allSlotsFilled(row.id) ? null : { code: 'slots_complete', message: 'Fill every slot first.' },
  )
  registerValidator('serviceRequest', 'reschedule', ({ payload }) =>
    payload.reason ? null : { reason: ['Required.'] }, // 422 (#34)
  )
  registerResolver('serviceRequest', 'send_next_mail', ({ row }) => ({ to: nextChainStatus(row) }))
  registerAuthorizer('serviceRequest', 'complete_deployment', ({ row, actor }) => ownsTour(row, actor))
  registerEffect('serviceRequest', 'close_order', ({ row, update }) => { … })
  onTransition('serviceRequest', ({ to, row }) => { … }) // after every transition
  ```

  `applyAction(resource, id, action, { actor, payload, trigger })` runs the whole pipeline:
  404 unknown action → 403 permission → 403 `not_own_tour` → 409 `transition_not_allowed`
  (+ `allowedActions`) → 409 `version_conflict` → 422 comment/validators → 409 `guard_failed`
  → resolver → status write + `status_transitions` row → effects. `evaluateActions` fills
  `availableActions`/`blockedActions`. The core action endpoints already dispatch through the
  engine; call it from your handlers for slice-specific endpoints. Core helpers: `moveAsset`,
  `setAppointment`, `locationOf`, and the read models (`srDetail`, `srListItem`,
  `assetSummary`…).

- **Handler helpers**: `apiPath('/x/:id')`, `authed(permission, resolver)` (401/403, gives
  you `actor`), `listResponse(rows, request, { search, filters, sortable, defaultSort, map })`
  (paging, `q`, comma filters, 422 on an unknown sort), `filterIn/filterBool/filterFrom/
filterTo`, `problem(status, code, title, …)` and `problems.*` (problem+json), `readJson`,
  `listOf`, `noContent`, `demoLatency()`, files (`storeFile`, `downloadLink`, `csv`,
  `simplePdf`) and jobs (`startJob` → `202 { jobId }`).
- Core endpoints: auth (login, personas, persona-login, logout), `/me`, `/meta/enums`,
  `/meta/config`, sites, regions, stock-locations, users, deviation-codes, `/search`, saved
  views CRUD, files, jobs (`GET /jobs?mine=true&status=…`), `/demo/reset`, SR/lease/asset
  detail and action/bulk endpoints, and a default `/appointments/sync-state` (H4 overrides it).

## 11. Seed fixture

`src/mocks/fixtures/seed.json` (`{ meta, tables, enums, config }`, SPEC_RESOLUTIONS #16) is the
**backend's own export**: `pnpm seed:import` runs `uv run hangar seed --export-json <tmp>` in
`../hangar-backend-demo` (`HANGAR_BACKEND_DIR` overrides; it needs the backend database, e.g.
`DATABASE_URL=postgresql+psycopg://dev:dev@localhost:5432/hangar_main`), validates the
envelope and writes the file with `meta.source = "backend"`. `--from=<file>` imports an
existing export. The current file (anchor 2026-10-13, ~5 MB) holds 7 users, 4 sites,
9 regions, 40 articles, 1,134 assets, 2,667 movements, 300 SRs, 876 items, 150 lease returns,
420 contacts and 1,707 status transitions, plus the backend's `enums` and `config`.

**When your backend slice adds seed data** (tours, calendars, mails, inventories…), re-run
`pnpm seed:import` (shared-file request) so the demo gets the same rows; until then seed your
tables in `mocks/seed.ts` from the core rows. Booking calendars and Theo's tour are **not** in
the core export yet: H4 provides them (backend export or mock seed). The mock serves
`config` with `demoMode: true`, no Mailpit link and an in-memory mailer.

`pnpm seed:handmade` (`scripts/seed-fixture/generate.ts`) writes the smaller hand-made dataset
used before the backend existed; use it only when the backend is unavailable. The fixture is
served as a static asset (not bundled), fetched only to seed or reset, and kept in the service
worker's runtime cache (not precached) so a reset works offline too.

## 12. Testing

- **Vitest**: `*.test.ts(x)` next to the code; import `describe/it/expect` from `vitest`. The
  setup loads `seed.json`, starts the MSW node server with all handlers
  (`onUnhandledRequest: 'error'`), resets the demo DB before each test and clears the session,
  localStorage and mocks afterwards. Helpers in `@/test/utils`: `renderWithProviders`,
  `signInAs(PERSONA_EMAILS.dispatcher)`, `createTestQueryClient`. Override endpoints with
  `server.use(...)`. Prefer `getByRole` queries.
- **Playwright**: `e2e/fixtures.ts` exports `test` (fails on console errors), `PERSONAS`,
  `persona('theo')` and `signIn(page, persona)`. Slices add `e2e/<module>-*.spec.ts`.
  Functional specs never write files (no `page.screenshot({ path })`): `pnpm test:e2e` must
  leave `git status` clean; screenshots live in `*screenshots.spec.ts` (`pnpm screenshots`).
  Prefer web-first assertions over sleeps. Scan sounds are off under automation (`sound.ts`).
  `E2E_PORT` moves the dev server Playwright starts (worktrees), `E2E_BASE_URL` targets a
  running one, `E2E_WORKERS` (default 2) sets the parallelism.
- Foundation suites cover the table, the saved-view and URL codec, the scan input and
  session, the workflow engine and transition maps, navigation permissions, the database, the
  list helpers and the API client.

## 13. PWA and deployment

- vite-plugin-pwa (generateSW, autoUpdate, off in dev). Manifest colours `#0f1215`; the icon
  is `public/icon.svg` (`pnpm icons:gen`). `index.html` applies theme and density before the
  first paint.
- A scope has one service worker, so demo builds run MSW inside the Workbox worker
  (`public/msw-bridge.js`, `/api/` only) and MSW registers `/sw.js` itself (no `registerSW.js`
  in demo builds: a second registration made MSW reload the page in a loop on the first visit).
  Dev mode uses `/mockServiceWorker.js`.
- Precache: app shell, route chunks, fonts and icons. `seed.json` and the zxing WASM are
  runtime-cached (CacheFirst) instead. Demo builds `modulepreload` the mock layer chunk, and
  `index.html` shows a boot splash until React renders.
- Vercel: `pnpm build:demo` → `dist` with an SPA rewrite (except `/api/`). CI runs lint,
  typecheck, test, build:demo and e2e (demo mode, 2 workers).

## 14. Decisions made in the foundation

These were taken without a human in the loop (2026-10-13). Revisit them if they get in your
way.

| Decision                                                                                              | Why                                                                    |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| TypeScript 6.0 (not 7), ESLint 10, MSW 2, TanStack Table v9, zod 4 without the zod adapter            | Tooling compatibility (typescript-eslint `<6.1`) and the spec versions |
| API types hand-written in `src/lib/api/types.ts`; `schema.d.ts` regenerated (27 backend paths so far) | The backend OpenAPI document was incomplete when the foundation began  |
| Seed fixture = backend export (`pnpm seed:import`); demo DB persisted in IndexedDB                    | One dataset for both; localStorage is too small for ~3.5 MB            |
| Operational screens (warehouse included) visible to technicians and viewers with `sr.read`            | SPEC_RESOLUTIONS #36 supersedes the SCREENS §1.2 ticks                 |
| 404 page inside the shell (`_app/$.tsx`), not at `src/routes/$.tsx`                                   | Keeps the navigation; unauthenticated users go to login first          |
| Column visibility/order/width per user in localStorage; saved views store filters and sort only       | SCREENS §0 (Tables)                                                    |
| Pagination footer with page numbers and per-page choice (25/50/100)                                   | SCREENS and the API.md paging envelope                                 |
| No global hub-scope selector in the top bar (the comps show one)                                      | Not in SCREENS; hub filters live in each screen's FilterBar            |
| Top-bar copy follows SCREENS ("Search or scan…", "Demo data · fake integrations")                     | SCREENS wins over the comps                                            |
| Rail collapsed by default below 1440 px (remembered once toggled)                                     | DESIGN shell widths                                                    |
| Hand-rolled `DatePicker` (no date library)                                                            | No new dependencies; business TZ formatting via `Intl`                 |
| Core mock answers `/appointments/sync-state` with a default                                           | The shell polls it before H4 exists; H4's handler overrides it         |
| 403 (`ForbiddenError`) is not logged to the console                                                   | Expected control flow; keeps the e2e console check meaningful          |
| `react-refresh/only-export-components` off for `src/components` and `src/lib`                         | Kit files keep variants and helpers next to their components           |
| Devtools hidden under browser automation                                                              | Screenshots and e2e runs without overlays                              |

### Release decisions (2026-10-13)

Taken while preparing the public demo, without a human in the loop.

| Decision                                                                                                                                                                                                           | Why                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| No frozen clock in the demo. Dates shift to today by whole weeks; the appointment sync state reports the last scheduled hourly run (hh:05) unless a manual sync is newer                                           | A static demo has no scheduler; a permanent "Sync overdue" would be false                          |
| Operational dates are absolute (`Wed 14 Oct · 09:30`) in tables, cards and drawers; relative wording only for ages (`4d` in stage) and tooltips                                                                    | Dispatchers plan by day and time; ages are the one place where "how long" matters more than "when" |
| Dispatchers land on the pipeline on phones too (the board scrolls sideways, the KPI strip is one swipeable row); technicians land on My tour                                                                       | One home per role on every device                                                                  |
| Configuration switches (calendars, dispatch settings) use `Switch variant="neutral"`; amber stays for switches that scope the current view                                                                         | One amber element per view (DESIGN §1)                                                             |
| Pipeline and dashboard share their KPI definitions: open = non-terminal requests (VIP excluded unless a tile says "incl. VIP"), deployed = last 7 days, lead time = median import → deployed over the last 30 days | The two screens showed different numbers for the same words                                        |
| The README screenshots come from one opt-in Playwright script; no test writes into the repository                                                                                                                  | `pnpm test:e2e` leaves `git status` clean                                                          |

> **CI Node version:** CI runs on Node 22 LTS (`.nvmrc`). Under Node 24, undici 7 rejects jsdom's `File` objects when MSW intercepts `fetch` in Vitest, which breaks the multipart mock tests (test-runtime only; browsers are unaffected). Vercel builds the demo on Node 24, which is fine because it doesn't run tests.
