# Hangar frontend conventions

How this codebase is organised and how to add to it. Read this before working on a slice.
Items marked **(2b)** are completed in foundation phase 2b, once `_spec/hangar/SCREENS.md`,
`API.md`, `DESIGN.md` and `tokens.css` exist.

## Ground rules for slices

1. **Stay in your lane.** A slice edits only `src/modules/<its module>/**` and
   `src/routes/<its module>/**`. Anything else (shared components, `src/lib`, `src/mocks`
   infrastructure, configs, `package.json`) is a _shared-file request_ in your final report.
2. **No new dependencies.** Everything slices need is installed. If something is missing,
   report it instead of adding it.
3. **Never hand-edit generated files**: `src/routeTree.gen.ts`, `src/lib/api/schema.d.ts`,
   `public/mockServiceWorker.js`.
4. `pnpm lint`, `pnpm typecheck`, `pnpm test` must pass before you hand back.

## Stack and version decisions

| Area          | Choice                                                                                                                                     | Note                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Build         | Vite 8, React 19, TypeScript 6 (strict)                                                                                                    | TS 7 (native) is out, but typescript-eslint supports `<6.1`, so we stay on 6.0.                                                        |
| Routing       | TanStack Router, file-based                                                                                                                | Search params validated with zod 4 directly (Standard Schema). `@tanstack/zod-adapter` is not used: it only supports zod 3.            |
| Server state  | TanStack Query 5                                                                                                                           | Devtools load in dev only.                                                                                                             |
| Tables, lists | TanStack Table **v9**, TanStack Virtual 3                                                                                                  | v9's API differs from v8. Use the table component from the UI kit **(2b)**, not raw v8 snippets.                                       |
| Client state  | TanStack Store (`@tanstack/react-store`)                                                                                                   | Zustand is not installed. Use it only for real client state (session, scan station). Server data belongs in Query, filters in the URL. |
| UI primitives | `radix-ui` (umbrella package), `cmdk`, `sonner`, `lucide-react`                                                                            | Styled wrappers live in `src/components/ui` **(2b)**.                                                                                  |
| Forms         | react-hook-form + `@hookform/resolvers/zod` + zod 4                                                                                        |                                                                                                                                        |
| Styling       | Tailwind CSS v4 (`@tailwindcss/vite`), `cn()`, `class-variance-authority`                                                                  | Tokens and fonts (`@fontsource*`) come in **(2b)**.                                                                                    |
| Mock API      | MSW **2** (2.15) + faker 10                                                                                                                | MSW 3.0 was released 2026-09-28; kept on v2 as specified.                                                                              |
| Charts        | recharts 3                                                                                                                                 |                                                                                                                                        |
| Scanning      | `barcode-detector` ponyfill on `zxing-wasm` (self-hosted WASM)                                                                             | See _Scan input_.                                                                                                                      |
| CSV           | papaparse                                                                                                                                  | For CSV previews and the demo-mode import mocks.                                                                                       |
| Lint/format   | ESLint 10 flat config (typescript-eslint type-checked, react-hooks, jsx-a11y, TanStack Query/Router plugins), Prettier 3 + tailwind plugin | jsx-a11y declares ESLint ≤9 but only uses APIs ESLint 10 still has. The peer warning is silenced in `pnpm-workspace.yaml`.             |
| Tests         | Vitest 5 + Testing Library + jsdom; Playwright (Chromium)                                                                                  |                                                                                                                                        |
| PWA           | vite-plugin-pwa 2 (generateSW, autoUpdate, off in dev)                                                                                     |                                                                                                                                        |

## Commands

| Command                          | What it does                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                       | Dev server on :5173 against the real API (`VITE_API_URL`, default `http://localhost:8100/api/v1`).                     |
| `pnpm dev:demo`                  | Dev server in demo mode (`--mode demo`, `.env.demo`): MSW mock API plus an in-browser database. No backend needed.     |
| `pnpm build` / `pnpm build:demo` | Type check, then production build (demo build = what Vercel deploys).                                                  |
| `pnpm preview`                   | Serve `dist` on :4173.                                                                                                 |
| `pnpm lint` / `pnpm format`      | ESLint (no warnings allowed) plus Prettier check / auto-fix.                                                           |
| `pnpm typecheck`                 | Regenerate the route tree, then `tsc -b --noEmit`.                                                                     |
| `pnpm test` / `pnpm test:watch`  | Vitest.                                                                                                                |
| `pnpm test:e2e`                  | Playwright smoke test (starts `pnpm dev:demo`). `E2E_BASE_URL=http://localhost:4173` targets a running server instead. |
| `pnpm routes:gen`                | Regenerate `src/routeTree.gen.ts` without a dev server.                                                                |
| `pnpm api:types`                 | Regenerate `src/lib/api/schema.d.ts` from `../hangar-backend-demo/openapi.json`.                                       |
| `pnpm icons:gen`                 | Render the PWA icons from `public/favicon.svg`.                                                                        |

Env: `.env.example` documents the variables. `.env.demo` is committed (no secrets).
Personal overrides go into `.env.local` (git-ignored).

## Layout

```
src/
  main.tsx              bootstrap: start mocks in demo mode, then render
  app.tsx, router.tsx   providers, router and query client singletons, Register types
  routes/               file-based routes (one folder per module)
  modules/<module>/     feature code, one folder per slice (see below)
  components/           shared components: app/ (shell), feedback/, ui/ (2b)
  lib/                  framework code: api/, auth/, query/, search/, forms/, nav/, scan/
  mocks/                mock API infrastructure (db, http/list helpers, state machines, registry)
  styles/app.css        Tailwind entry and theme
  test/setup.ts         Vitest setup (MSW server, demo DB, cleanup)
e2e/                    Playwright specs
```

File names are `kebab-case`. Import through the `@/` alias (`@/lib/api`), never with
`../../`.

## Module system

Modules: `core` (foundation: start page, session, shared lookups), `requests` (H1),
`imports` (H2), `staging` (H3), `field` (H4), `stock` (H5).

```
src/modules/<module>/
  nav.ts               export const nav: NavEntry[]   (picked up automatically)
  api.ts               public surface: query keys, queryOptions, mutation hooks, types
  components/          private UI of the module
  mocks/handlers.ts    export const handlers: RequestHandler[]   (picked up automatically)
  mocks/seed.ts        export const seed: SeedDefinition         (picked up automatically)
src/routes/<module>/
  route.tsx            layout route: beforeLoad: requirePermission('<module>:read')
  index.tsx, $id.tsx, ...
```

- **Boundaries (ESLint-enforced):** another module is reachable only through its `api.ts`
  or `nav.ts`. Its components and internals are private. Exception: a module's `mocks/` may
  import other modules' `mocks/`, because the mock layer is one simulated backend.
  A component two modules need goes to `src/components` via a shared-file request.
- **Navigation:** `useNavigation()` (`@/lib/nav/use-navigation`) aggregates every module's
  `nav.ts` via `import.meta.glob`, filters by the user's permissions and groups by
  `NAV_GROUPS`. A `NavEntry` has `id` (unique, `module.screen`), `label`, `to` (type-checked
  route path), `group`, `icon` (lucide), `permission`, `shortcut` (key sequence like `g r`,
  unique app-wide; a unit test checks this), `order`, `description`, `keywords`. Keep `nav.ts`
  light: it is loaded eagerly. The shell, command palette and shortcut handler **(2b)** all
  read from it.

## Routing

- File-based routing with TanStack Router. The Vite plugin (and `pnpm routes:gen`)
  **regenerates `src/routeTree.gen.ts`. It is committed, never hand-edited.** On a merge
  conflict in it, take either side and run `pnpm routes:gen`.
- Code splitting is automatic (`autoCodeSplitting`). Route files export only `Route`.
  Components defined in the file are split out.
- **Auth is secure by default:** the root route redirects to `/login?redirect=…` for every
  path not in `PUBLIC_PATHS` (`src/lib/auth/guards.ts`). Authorization per module or
  screen: `beforeLoad: requirePermission('requests:read')`. A missing permission throws
  `ForbiddenError`, and the default error component renders a 403 panel.
- `staticData: { title, layout }`: `layout: 'bare'` renders without the app shell (login,
  print views).
- Data loading: route loaders prefetch with the router context's query client, and
  components read with `useSuspenseQuery` (or `useQuery`) using the same options:

  ```ts
  export const Route = createFileRoute('/requests/$id')({
    loader: ({ context, params }) =>
      context.queryClient.ensureQueryData(serviceRequestQueries.detail(params.id)),
    component: RequestDetail,
  })
  ```

  The router uses `defaultPreload: 'intent'` and `defaultPreloadStaleTime: 0`, so Query's
  `staleTime` decides freshness.

## Search params: filters, sorting, paging, saved views

All list state lives in the URL, so every view can be linked, bookmarked and restored.

```ts
import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { listSearchDefaults, listSearchSchema } from '@/lib/search/list-search'

const searchSchema = listSearchSchema.extend({
  status: z.array(z.enum(SR_STATUSES)).optional().catch(undefined),
  site: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/requests/')({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(listSearchDefaults)] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(serviceRequestQueries.list(deps)),
})

// in the component
const search = Route.useSearch() // fully typed, defaults applied
const navigate = Route.useNavigate()
navigate({ search: (prev) => ({ ...prev, status: ['invited'], page: 1 }) })
```

- `listSearchSchema` provides `page`, `pageSize`, `sort` (`-openedAt,number`), `q`, `view`.
  Use `parseSort` / `formatSort` for table sorting state.
- Every field is optional or defaulted, and invalid values `.catch()` to a default, so
  hand-edited URLs never crash a screen. Reset `page` to 1 whenever a filter changes.
- Defaults are stripped from the URL (`stripSearchParams`) to keep links short.
- **Saved views** are named snapshots of a route's search object. `view=<id>` marks the
  active one. Storage and UI (per user, per route) **(2b)**: `useSavedViews(routeId)`.

## Data fetching

- **Client:** `api` from `@/lib/api` (`openapi-fetch`, typed from `schema.d.ts`). The base URL
  comes from `VITE_API_URL`. The bearer token is attached automatically. A 401 signs out and
  navigates to `/login?redirect=…`.
- **Errors:** every failure becomes an `ApiError { status, title, detail, type, fieldErrors }`
  (`@/lib/api/errors`). It accepts problem+json, FastAPI `{ detail }`, text, and network
  failures (`status 0`). `fieldErrors` keys are dot paths (`items.0.serial`). Non-field
  errors use the key `root`.
- **`unwrap()`** returns the data or throws the `ApiError`. Use it in every query and
  mutation function:

  ```ts
  // src/modules/requests/api.ts
  export const serviceRequestKeys = createQueryKeys('service-requests')

  export const serviceRequestQueries = {
    list: (search: RequestListSearch) =>
      queryOptions({
        queryKey: serviceRequestKeys.list(search),
        queryFn: ({ signal }) =>
          unwrap(api.GET('/service-requests', { params: { query: toQuery(search) }, signal })),
        placeholderData: keepPreviousData,
      }),
    detail: (id: string) =>
      queryOptions({
        queryKey: serviceRequestKeys.detail(id),
        queryFn: ({ signal }) =>
          unwrap(api.GET('/service-requests/{id}', { params: { path: { id } }, signal })),
      }),
  }

  export function useTransitionServiceRequest() {
    return useMutation({
      mutationFn: (input: { id: string; action: string }) =>
        unwrap(api.POST('/service-requests/{id}/transitions', { ... })),
      meta: { invalidates: [serviceRequestKeys.all], successToast: 'Status updated' },
    })
  }
  ```

- **Query keys:** one `createQueryKeys('<resource>')` factory per API resource (kebab-case,
  like the URL), exported from the module's `api.ts`. Hierarchy: `all` › `lists()` ›
  `list(params)`, and `all` › `details()` › `detail(id)`, plus `scope(...)` for extras.
- **Invalidation:** declare it on the mutation with `meta.invalidates: QueryKey[]` (prefixes).
  The global `MutationCache` invalidates them after success and keeps the mutation pending
  until the refetch is done. Invalidate the broadest correct prefix. Cross-module effects
  (for example a staging action that changes an SR) import the other module's keys from its
  `api.ts`.
- **Toasts:** mutation errors toast globally. Use `meta.errorToast: false` when the UI shows
  the error itself (forms), or a string to override the title. `meta.successToast` for
  confirmations. Query errors on first load render inline. Failed background refetches toast.
- **Defaults:** `staleTime` 30 s. 4xx responses are not retried. Mutations never retry.
- **Server-driven actions:** resources carry `availableActions` **(2b: exact shape from
  API.md)**. Show or enable action buttons from it. Never re-derive rules on the client.

## Forms

react-hook-form + `zodResolver(schema)` + zod 4. Submit through a mutation with
`meta: { errorToast: false }`, then map server validation errors into the form:

```ts
const onSubmit = form.handleSubmit(async (values) => {
  try {
    await mutation.mutateAsync(values)
  } catch (error) {
    applyServerErrors(error, form.setError) // @/lib/forms/server-errors
  }
})
```

Unknown fields and non-field errors land in `errors.root.server`: render it above the
submit button. Form field components **(2b)**.

## Auth and permissions

- Session: `@/lib/auth/store` (TanStack Store, persisted to `localStorage` under
  `hangar.auth.v1`, synced across tabs). Outside React: `getAuth()`, `isAuthenticated()`,
  `can()`, `signIn()`, `signOut()`. Hooks: `useAuth()`, `useCurrentUser()`, `useCan()`.
- Permissions are `resource:action` strings. Demo admin has `*`. The server is the authority.
  The client only hides navigation and guards routes. **(2b):** a literal union from API.md,
  demo personas, and the real login. The current `/login` "Continue as demo admin" button is
  a phase-2a placeholder.

## Mock API (demo mode and tests)

Demo mode (`VITE_DEMO_MODE=true`) runs the whole app in the browser: `src/main.tsx` awaits
`startMockWorker()` before rendering. The same handlers and seed data run in Vitest
(`src/mocks/node.ts`).

- **Registry:** `src/mocks/handlers.ts` collects every `src/modules/*/mocks/handlers.ts`
  (export `handlers`) and `mocks/seed.ts` (export `seed`) via `import.meta.glob`. Unmocked API
  calls get a `501` problem response, never the network. `GET /health` reports
  `{ demo: true }`.
- **Database** (`src/mocks/db.ts`): typed collections, declared by module augmentation from
  your own folder:

  ```ts
  // src/modules/requests/mocks/seed.ts
  declare module '@/mocks/db' {
    interface DemoCollections {
      serviceRequests: ServiceRequestRecord
    }
  }
  export const seed: SeedDefinition = {
    module: 'requests',
    version: 1, // bump when the data shape changes -> every browser reseeds
    order: 20, // core = 0; later seeds can read earlier collections
    run: ({ db, faker, refDate }) => {
      db.collection('serviceRequests').insertMany(/* ... */)
    },
  }
  ```

  `Collection` API: `all`, `get`, `has`, `find`, `filter`, `count`, `insert`, `insertMany`,
  `update(id, patch | fn)`, `upsert`, `remove`, `removeWhere`, `clear`, `nextNumericId`.
  Records are immutable snapshots: never mutate them in place.

- **Determinism:** each seed gets its own faker instance seeded from the module name, with
  `refDate` = start of the seeding day. Use `faker` and `refDate` for every random value or
  date (no `Math.random()` or `new Date()` in seeds). Data persists in localStorage
  (`hangar.demo-db.v1`) until a seed `version` changes or the user clicks _Reset demo data_
  (`resetDemoData()`). In the browser console, `__hangarDemo.db` shows the data.
- **Handler helpers** (`@/mocks/http`, `@/mocks/list`, `@/mocks/transitions`):
  - `apiPath('/service-requests/:id')`: the URL pattern following `VITE_API_URL`.
  - `listResponse(items, request, { searchFields, filters: { status: filterIn('status') }, defaultSort, map })`:
    paging, sorting, `q` search and filters with the API's query syntax and list envelope
    **(2b: aligned with API.md)**.
  - `problem(status, title, { detail, fieldErrors })` and `problems.notFound|conflict|validation|forbidden|...`:
    problem+json responses.
  - `defineMachine<Record, 'status'>()({ statusKey, transitions })`: explicit status machines.
    `machine.availableActions(record, ctx)` fills `availableActions`.
    `machine.apply(record, action, ctx)` returns `{ ok, patch }` or a ready 403/409/422 problem
    `response`.
  - `demoLatency()`: realistic delay in the browser, instant in tests. `readJson(request)`,
    `nowIso()`.
  - **(2b):** request-user helpers (session lookup, `ctx.can`), core collections (users,
    sites, regions, articles), and shared domain machines that span slices (the service
    request lifecycle).
- Mock handlers must validate input and enforce permissions like the real API, and return
  the same shapes. A screen that works in demo mode should work against the backend
  unchanged.

## Scan input (placeholder, 2b)

Hardware scanners act as keyboards ("type and Enter"). Camera scanning uses
`createCodeDetector()` from `@/lib/scan/barcode`: native `BarcodeDetector` where available,
otherwise the zxing-wasm ponyfill with self-hosted WASM, which is precached for offline use.
Phase 2b adds the shared `ScanInput` component (focus handling, Enter to submit, debounce,
duplicate detection, success and error feedback). Slices use it and do not build their own.

## UI and styling (placeholder, 2b)

Tailwind v4 with tokens from `tokens.css`. Compose classes with `cn()` (`@/lib/utils`).
Variants use `cva`. Components wrap `radix-ui` primitives in `src/components/ui`. Icons come
from `lucide-react`. Toasts use `sonner` (`toast.success(...)`). The `@fontsource*` packages
are chosen and installed in 2b per DESIGN.md. Until then, `src/styles/app.css` is a
placeholder.

## Testing

- **Unit and component:** `*.test.ts(x)` next to the code. Vitest globals are off, so import
  `describe`/`it`/`expect` from `vitest`. The setup starts the MSW server with all handlers and
  resets the demo DB, auth store and localStorage around each test. Use `server.use(...)` for
  per-test overrides. Unhandled requests fail the test.
- **E2E:** `e2e/*.spec.ts`, Chromium only, against `pnpm dev:demo` on :5173. Keep the smoke
  test green. Slices add flows for their screens.
- Accessibility: prefer `getByRole` queries. jsx-a11y lint rules are errors.

## PWA and deployment

- vite-plugin-pwa: manifest "Hangar", standalone, autoUpdate, disabled in dev. Theme colour and
  icons are placeholders **(2b)**.
- A scope can have only one service worker, so demo builds run MSW inside the Workbox worker:
  `sw.js` imports `public/msw-bridge.js`, which loads `mockServiceWorker.js` and lets it see only
  `/api/` requests. Workbox keeps precache and navigation. The demo works offline once loaded.
  Dev mode uses the plain `/mockServiceWorker.js`.
- Vercel (`vercel.json`): `pnpm build:demo` → `dist`, SPA rewrite, no-cache for the
  service-worker files, immutable `/assets`. Check locally with
  `pnpm build:demo && npx serve -s dist -l 4173`.
- CI (`.github/workflows/ci.yml`): install, lint, typecheck, test, build:demo, Playwright smoke.
