import { expect, persona, signIn, test } from './fixtures'

/** H2 permissions (SPEC §3): viewers read imports, technicians have no Data screens. */

test('Vic Viewer reads the import history but cannot upload or cancel', async ({ page }) => {
  await signIn(page, persona('vic'))
  await page.goto('/data/imports')
  await expect(page.getByRole('heading', { level: 1, name: 'Imports' })).toBeVisible()
  await expect(page.getByText('Imported with issues')).toBeVisible()
  await expect(page.getByRole('button', { name: /New import/ })).toHaveCount(0)

  // deep link to the upload dialog does not open it
  await page.goto('/data/imports?upload=true')
  await expect(page.getByRole('heading', { level: 1, name: 'Imports' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // the formats panel offers samples, but no generator
  await expect(page.getByRole('button', { name: 'Download sample' })).toBeVisible()
  await expect(page.getByText('Generate fresh ITSM export')).toHaveCount(0)

  // detail is readable
  await page.getByText(/itsm_lease_export_\d{8}\.csv/).click()
  await expect(page.getByRole('heading', { level: 1, name: /^Import #\d+$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel import' })).toHaveCount(0)
})

test('Theo Technician has no import screens; admin screens stay admin-only', async ({ page }) => {
  await signIn(page, persona('theo'))
  await page.goto('/data/imports')
  await expect(page.getByText("You don't have access to this screen.")).toBeVisible()

  await signIn(page, persona('dana'))
  await page.goto('/admin/users')
  await expect(page.getByText("You don't have access to this screen.")).toBeVisible()
})
