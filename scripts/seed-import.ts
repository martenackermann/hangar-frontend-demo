/**
 * Replaces the hand-made `src/mocks/fixtures/seed.json` with the backend's seed export
 * (SPEC §2.4, SPEC_RESOLUTIONS #16):
 *
 *   pnpm seed:import                      # backend at ../hangar-backend-demo
 *   HANGAR_BACKEND_DIR=/path pnpm seed:import
 *   pnpm seed:import --from=/tmp/seed.json # import an already exported file
 *
 * Runs `uv run hangar seed --export-json <tmp>` in the backend checkout (needs its database,
 * see the backend README), validates the `{ meta, tables, enums, config }` envelope and the
 * fixture version, tags `meta.source = "backend"` and writes the fixture. Exits non-zero with a
 * clear message when the backend, `uv` or the database is not available; the existing fixture
 * is left untouched in that case.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FIXTURE_VERSION = 1
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'src', 'mocks', 'fixtures', 'seed.json')

class SeedImportError extends Error {}

function fail(message: string): never {
  throw new SeedImportError(message)
}

function exportFromBackend(): string {
  const backend = resolve(root, process.env.HANGAR_BACKEND_DIR ?? '../hangar-backend-demo')
  if (!existsSync(join(backend, 'pyproject.toml'))) {
    fail(
      `no backend checkout at ${backend} (set HANGAR_BACKEND_DIR). The hand-made fixture stays in place.`,
    )
  }
  const out = mkdtempSync(join(tmpdir(), 'hangar-seed-'))
  console.info(`seed:import: uv run hangar seed --export-json ${out} (in ${backend})`)
  const result = spawnSync('uv', ['run', 'hangar', 'seed', '--export-json', out], {
    cwd: backend,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error)
    fail(`could not run uv: ${result.error.message}. Install uv or pass --from=<seed.json>.`)
  if (result.status !== 0) {
    fail(
      `the backend seed export failed (exit ${String(result.status)}). Is its database running? See the backend README.`,
    )
  }
  const file = join(out, 'seed.json')
  if (!existsSync(file)) fail(`the backend did not write ${file}`)
  return file
}

function main(): void {
  const fromArg = process.argv.find((arg) => arg.startsWith('--from='))
  const source = fromArg ? resolve(fromArg.slice('--from='.length)) : exportFromBackend()

  let data: unknown
  try {
    data = JSON.parse(readFileSync(source, 'utf8'))
  } catch (cause) {
    fail(`${source} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`)
  }

  if (typeof data !== 'object' || data === null) fail('seed.json must be an object')
  const fixture = data as Record<string, unknown>
  for (const key of ['meta', 'tables', 'enums', 'config']) {
    if (typeof fixture[key] !== 'object' || fixture[key] === null)
      fail(`seed.json has no "${key}" object`)
  }
  const meta = fixture.meta as Record<string, unknown>
  if (meta.version !== FIXTURE_VERSION) {
    fail(
      `fixture version ${String(meta.version)} != ${FIXTURE_VERSION}; update src/mocks/fixtures/types.ts first`,
    )
  }
  if (typeof meta.anchorDate !== 'string') fail('meta.anchorDate is missing')
  const tables = fixture.tables as Record<string, unknown>
  for (const [name, rows] of Object.entries(tables)) {
    if (!Array.isArray(rows)) fail(`tables.${name} is not an array`)
  }

  meta.source = 'backend'
  writeFileSync(target, JSON.stringify(fixture) + '\n', 'utf8')
  const counts = Object.entries(tables)
    .map(([name, rows]) => `${name} ${(rows as unknown[]).length}`)
    .join(', ')
  console.info(`seed:import: wrote ${target} (anchor ${meta.anchorDate}; ${counts})`)
  if (!fromArg) rmSync(dirname(source), { recursive: true, force: true })
}

try {
  main()
} catch (error) {
  if (!(error instanceof SeedImportError)) throw error
  console.error(`seed:import: ${error.message}`)
  process.exitCode = 1
}
