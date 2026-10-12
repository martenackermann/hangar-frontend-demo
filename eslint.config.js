import js from '@eslint/js'
import pluginQuery from '@tanstack/eslint-plugin-query'
import pluginRouter from '@tanstack/eslint-plugin-router'
import prettier from 'eslint-config-prettier/flat'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** Feature modules under src/modules. Keep in sync when a module is added (CONVENTIONS.md). */
const MODULES = ['core', 'requests', 'imports', 'staging', 'field', 'stock']

/**
 * Module boundaries: a module may import another module only through its public
 * `api.ts` (query options, keys, types) or `nav.ts`. Components and internals stay private;
 * only a module's mocks may import other modules' mocks.
 */
function boundaryRule(name, extraAllowed = []) {
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              '@/modules/*/**',
              `!@/modules/${name}/**`,
              '!@/modules/*/api',
              '!@/modules/*/nav',
              ...extraAllowed,
            ],
            message:
              'Import other modules only via their public api.ts / nav.ts (see CONVENTIONS.md, "Module system").',
          },
          {
            group: ['../../*', '../../../*'],
            message: 'Use the @/ alias instead of climbing out of the module folder.',
          },
        ],
      },
    ],
  }
}

const moduleBoundaries = MODULES.flatMap((name) => [
  {
    name: `hangar/module-boundaries/${name}`,
    files: [`src/modules/${name}/**/*.{ts,tsx}`],
    rules: boundaryRule(name),
  },
  {
    // The mock layer is one simulated backend: mocks may share each other's mock code.
    name: `hangar/module-boundaries/${name}/mocks`,
    files: [`src/modules/${name}/mocks/**/*.{ts,tsx}`],
    rules: boundaryRule(name, ['!@/modules/*/mocks', '!@/modules/*/mocks/**']),
  },
])

export default defineConfig([
  globalIgnores([
    'dist',
    'dev-dist',
    'coverage',
    'playwright-report',
    'test-results',
    'public/mockServiceWorker.js',
    'src/routeTree.gen.ts',
    'src/lib/api/schema.d.ts',
  ]),
  {
    name: 'hangar/typescript',
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat['recommended-latest'],
      jsxA11y.flatConfigs.recommended,
      reactRefresh.configs.vite,
      pluginQuery.configs['flat/recommended'],
      pluginRouter.configs['flat/recommended'],
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    // Route files export `Route` plus non-exported components; TanStack's automatic code
    // splitting moves the components into their own chunks, so Fast Refresh still works.
    name: 'hangar/routes',
    files: ['src/routes/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    name: 'hangar/tests',
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'e2e/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    name: 'hangar/node-files',
    files: ['*.config.ts', 'e2e/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    name: 'hangar/javascript',
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    name: 'hangar/service-worker-scripts',
    files: ['public/**/*.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  ...moduleBoundaries,
  prettier,
])
