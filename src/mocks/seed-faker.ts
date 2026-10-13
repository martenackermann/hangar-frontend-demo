/**
 * The parts of faker the seeds use, as one module so the lazy `import('./seed-faker')` in
 * `db.ts` gets a tree-shaken chunk (~400 kB) instead of every faker locale (~2.4 MB).
 */
export { base, en, Faker } from '@faker-js/faker'
