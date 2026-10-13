import { expect, persona, signIn, test } from './fixtures'

/**
 * H2 imports (demo mode, MSW mock import engine): upload with type detection, live progress,
 * import detail with issue table, severity filter and failed-row report.
 */

function csvFile(name: string, lines: string[]) {
  return { name, mimeType: 'text/csv', buffer: Buffer.from(`${lines.join('\n')}\n`, 'utf8') }
}

/** Contacts export: one clean row, one without email (warning), one bad user id (error). */
const CONTACTS = csvFile('itsm_users_e2e.csv', [
  'user_id,gender,first_name,last_name,email,department',
  'E900001,female,Mira,Testwood,mira.testwood@example.com,Finance',
  'E900002,male,Jon,Fieldmark,,Sales',
  'E9-01,diverse,Nora,Badrow,nora.badrow@example.com,Legal',
])

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
})

test('Dana uploads a contacts export and reads the result', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/data/imports')
  await expect(page.getByRole('heading', { level: 1, name: 'Imports' })).toBeVisible()
  // the seeded history (SPEC §11.7): the T−1 service-request file has issues
  await expect(page.getByText('Imported with issues')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Formats' })).toBeVisible()

  await page.getByRole('button', { name: /New import/ }).click()
  const wizard = page.getByRole('dialog')
  await expect(wizard.getByRole('heading', { name: 'New import' })).toBeVisible()
  await wizard.locator('input[type=file]').setInputFiles(CONTACTS)
  await expect(wizard.getByText('Detected from the column headers.')).toBeVisible()
  await expect(wizard.getByText(/ · 3 rows · /)).toBeVisible()
  await expect(wizard.getByText(/required columns found/)).toBeVisible()

  await wizard.getByRole('button', { name: 'Continue' }).click()
  await expect(wizard.getByText('Dry run (validate only, no changes)')).toBeVisible()
  await wizard.getByRole('button', { name: 'Start import' }).click()

  // the wizard hands over to the import detail, which follows the job until it is done
  await expect(page).toHaveURL(/\/data\/imports\/\d+$/)
  await expect(page.getByRole('heading', { level: 1, name: /^Import #\d+$/ })).toBeVisible()
  await expect(page.getByText('Imported with issues').first()).toBeVisible({ timeout: 30_000 })
  const issues = page.getByRole('region', { name: 'Issues' })
  await expect(issues.getByText('email_missing', { exact: true }).first()).toBeVisible()
  await expect(issues.getByText('invalid_format', { exact: true }).first()).toBeVisible()
  await expect(
    page.getByText(/1 row with errors were not imported|1 row with errors/),
  ).toBeVisible()

  // severity filter is part of the URL
  await page.getByRole('radio', { name: 'Errors' }).click()
  await expect(page).toHaveURL(/severity=error/)
  await expect(issues.getByText('email_missing', { exact: true })).toHaveCount(0)
  await expect(issues.getByText('invalid_format', { exact: true }).first()).toBeVisible()

  // failed-row report
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download error report' }).click()
  expect((await download).suggestedFilename()).toMatch(/\.csv$/)

  // back in the history, the new import is listed with its file name
  await page.getByRole('link', { name: 'Imports' }).first().click()
  await expect(page).toHaveURL(/\/data\/imports$/)
  await expect(page.getByText('itsm_users_e2e.csv', { exact: true })).toBeVisible()
})

test('the seeded T−1 import shows its issues and post-processing summary', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/data/imports?status=completed_with_errors')
  await page
    .getByText(/itsm_sr_export_\d{8}\.csv/)
    .first()
    .click()
  await expect(page).toHaveURL(/\/data\/imports\/\d+/)
  await expect(page.getByText('packed_missing_key', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('packed_duplicate_key', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/contacts created/)).toBeVisible()
  // the code chips filter the table
  await page.getByRole('button', { name: /^duplicate_in_file/ }).click()
  await expect(page).toHaveURL(/code=duplicate_in_file/)
  await expect(page.getByText('packed_missing_key', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/appears more than once in this file/)).toBeVisible()

  // phone layout: tiles stack, issues become cards
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByText(/appears more than once in this file/)).toBeVisible()
})

test('files that cannot be imported are explained before anything starts', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/data/imports?upload=true')
  const wizard = page.getByRole('dialog')

  // unknown headers: the type must be chosen by hand, then missing columns block the start
  await wizard.locator('input[type=file]').setInputFiles(csvFile('mystery.csv', ['foo,bar', '1,2']))
  await expect(wizard.getByText('Not detected — choose the type of this file.')).toBeVisible()
  await expect(wizard.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await wizard.getByRole('combobox').first().click()
  await page.getByRole('option', { name: 'Contacts' }).click()
  await expect(wizard.getByText('user_id, last_name')).toBeVisible()
  await expect(wizard.getByRole('button', { name: 'Continue' })).toBeDisabled()

  // a file that is not CSV/XLSX is refused
  await wizard.getByRole('button', { name: 'Back' }).click()
  await wizard.locator('input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  })
  await expect(wizard.getByText('The file was not accepted')).toBeVisible()
})

test('a sample file downloads from the formats panel', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/data/imports')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download sample' }).click()
  expect((await download).suggestedFilename()).toMatch(/service_requests.*\.csv$/)
})
