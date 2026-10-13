import { mkdirSync } from 'node:fs'
import { expect, persona, signIn, test } from './fixtures'

/**
 * H2 master data as Ada Admin (demo mode): articles with per-hub min/max, region rule tester and
 * reapply, VIP list, user administration with the persona lock.
 */
const OUT = 'docs/screenshots/imports'
mkdirSync(OUT, { recursive: true })

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, persona('ada'))
})

test('Ada creates an article and sets a hub minimum', async ({ page }) => {
  await page.goto('/admin/articles')
  await expect(page.getByRole('heading', { level: 1, name: 'Articles' })).toBeVisible()
  await page.getByRole('button', { name: /New article/ }).click()
  await expect(page).toHaveURL(/article=new/)

  await page.getByLabel('Article number').fill('A-19901')
  await page.getByLabel('Category').click()
  await page.getByRole('option', { name: 'Webcam' }).click()
  await page.getByLabel(/^Name/).fill('Vista C2 Webcam')
  await page.getByLabel('Manufacturer').fill('Lumen Optics')
  await page.getByLabel('Model number').fill('LM-VISTA-C2')
  await page.getByLabel('Device type').fill('Webcam Conference')
  await page.getByLabel('Weight (kg)').fill('0.3')
  await page.getByRole('button', { name: 'Create article' }).click()

  // the drawer switches to the new article and shows its per-hub settings
  await expect(page).toHaveURL(/article=\d+/)
  const minRiverton = page.getByLabel('Min at Riverton Hub')
  await expect(minRiverton).toBeVisible()
  await minRiverton.fill('4')
  await minRiverton.press('Enter')
  await expect(page.getByText('A-19901').first()).toBeVisible()
  await page.screenshot({ path: `${OUT}/admin-articles-editor-1440.png` })

  await page.reload()
  await expect(page.getByLabel('Min at Riverton Hub')).toHaveValue('4')
})

test('Ada tests an address against the region rules and reapplies them', async ({ page }) => {
  await page.goto('/admin/regions')
  await expect(page.getByRole('heading', { level: 1, name: 'Regions' })).toBeVisible()
  const tester = page.getByRole('region', { name: 'Test an address' })
  await tester.getByLabel('Zip').fill('10115')
  await tester.getByRole('button', { name: 'Resolve' }).click()
  await expect(tester.getByRole('button', { name: 'Riverton' })).toBeVisible()
  await expect(tester.getByText(/normalized: zip 10115/)).toBeVisible()
  await page.screenshot({ path: `${OUT}/admin-regions-tester-1440.png` })

  // the region drawer lists its rules
  await tester.getByRole('button', { name: 'Riverton' }).click()
  await expect(page).toHaveURL(/region=\d+/)
  await expect(page.getByText(/^Rules · \d+$/)).toBeVisible()
  await page.screenshot({ path: `${OUT}/admin-regions-drawer-1440.png` })

  await page.getByRole('button', { name: 'Reapply rules' }).first().click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Reapply rules' }).click()
  await expect(page.getByText(/Reapply region rules/).first()).toBeVisible()
})

test('Ada adds a VIP entry', async ({ page }) => {
  await page.goto('/admin/vip-list')
  await expect(page.getByRole('heading', { level: 1, name: 'VIP list' })).toBeVisible()
  await page.getByRole('button', { name: /Add VIP/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('User id').fill('E900777')
  await dialog.getByLabel('First name').fill('Selma')
  await dialog.getByLabel('Last name').fill('Northcott')
  await dialog.getByLabel('Type').fill('Executive')
  await dialog.getByLabel('Title').fill('Chief Legal Officer')
  await page.screenshot({ path: `${OUT}/admin-vip-dialog-1440.png` })
  await dialog.getByRole('button', { name: 'Add VIP' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('E900777')).toBeVisible()
  await expect(page.getByText('Chief Legal Officer')).toBeVisible()
})

test('Ada creates and deactivates a user; personas are locked', async ({ page }) => {
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible()
  await expect(page.getByLabel('Demo persona').first()).toBeVisible()

  await page.getByRole('button', { name: /New user/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Email').fill('greta.holm@example.com')
  await dialog.getByLabel('First name').fill('Greta')
  await dialog.getByLabel('Last name').fill('Holm')
  await dialog.getByLabel('Role').click()
  await page.getByRole('option', { name: 'Technician' }).click()
  await dialog.getByLabel('Initial password').fill('fieldwork-2026')
  await dialog.getByRole('button', { name: 'Create user' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('greta.holm@example.com')).toBeVisible()

  // personas keep their password
  await page.getByRole('button', { name: 'Actions for Theo Technician' }).click()
  await expect(page.getByRole('menuitem', { name: /Reset password/ })).toBeDisabled()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Actions for Greta Holm' }).click()
  await page.getByRole('menuitem', { name: 'Deactivate' }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toContainText('future planned tours go back to draft')
  await confirm.getByRole('button', { name: 'Deactivate' }).click()
  await expect(page.getByRole('row', { name: /Greta Holm/ }).getByText('Deactivated')).toBeVisible()
  await page.screenshot({ path: `${OUT}/admin-users-1440.png` })
})
