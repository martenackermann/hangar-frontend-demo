import { expect, persona, signIn, test } from './fixtures'

/**
 * H5 assets (SCREENS.md §7.4): filters, the asset drawer with the movement ledger, mark missing
 * → mark found, correction with a reason, bulk mark missing.
 */

test('Dana marks an asset missing and found again from the drawer', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/stock/assets?status=available')
  await expect(page.getByRole('heading', { level: 1, name: 'Assets' })).toBeVisible()
  const table = page.getByRole('table', { name: 'Assets' })
  await table.getByRole('row').nth(1).click()
  await expect(page).toHaveURL(/[?&]asset=\d+/)

  const drawer = page.getByRole('complementary', { name: /^Asset / })
  await drawer.getByRole('tab', { name: 'Movements' }).click()
  await expect(drawer.getByRole('listitem').first()).toBeVisible()

  await drawer.getByRole('button', { name: 'Mark missing' }).click()
  const missing = page.getByRole('dialog', { name: /^Mark .+ missing\?$/ })
  await missing.getByRole('textbox', { name: /Reason/ }).fill('Not on its shelf (e2e)')
  await missing.getByRole('button', { name: 'Mark missing' }).click()
  await expect(missing).toBeHidden()
  await expect(drawer.getByText('Missing').first()).toBeVisible()

  await drawer.getByRole('button', { name: 'Mark found' }).click()
  const found = page.getByRole('dialog', { name: /^Mark .+ found$/ })
  await found.getByRole('combobox', { name: 'Found at' }).click()
  await page
    .getByRole('option', { name: /Staging/ })
    .first()
    .click()
  await found.getByRole('button', { name: 'Mark found' }).click()
  await expect(found).toBeHidden()
  await expect(drawer.getByText('Available').first()).toBeVisible()

  // both movements are in the ledger, newest first
  await drawer.getByRole('tab', { name: 'Movements' }).click()
  await expect(drawer.getByText('“Not on its shelf (e2e)”')).toBeVisible()
})

test('a correction needs a reason and lands in the ledger', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/stock/assets?status=available&hasInstallationPlace=true')
  await page.getByRole('table', { name: 'Assets' }).getByRole('row').nth(1).click()
  const drawer = page.getByRole('complementary', { name: /^Asset / })
  await drawer.getByRole('button', { name: 'Correct' }).click()
  const dialog = page.getByRole('dialog', { name: /^Correct / })
  await dialog.getByRole('button', { name: 'Save correction' }).click()
  await expect(dialog.getByText('A reason is required for corrections.')).toBeVisible()

  await dialog.getByRole('textbox', { name: 'Installation place' }).fill('z9-99')
  await dialog.getByRole('textbox', { name: /^Reason/ }).fill('Relabelled shelf (e2e)')
  await dialog.getByRole('button', { name: 'Save correction' }).click()
  await expect(dialog).toBeHidden()
  await expect(drawer.getByText('Z9-99').first()).toBeVisible()
  await drawer.getByRole('tab', { name: 'Movements' }).click()
  await expect(drawer.getByText('“Relabelled shelf (e2e)”')).toBeVisible()
})

test('bulk mark missing applies to the selected rows', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/stock/assets?status=available')
  const table = page.getByRole('table', { name: 'Assets' })
  // row checkboxes are named after the record ("Select GX100123")
  await table.getByRole('row').nth(1).getByRole('checkbox').check()
  await table.getByRole('row').nth(2).getByRole('checkbox').check()
  const bar = page.getByRole('toolbar', { name: '2 selected' }).or(page.getByLabel('2 selected'))
  await bar.getByRole('button', { name: 'Mark missing' }).click()
  const dialog = page.getByRole('dialog', { name: 'Mark 2 assets missing?' })
  await dialog.getByRole('button', { name: 'Mark missing' }).click()
  await expect(dialog).toBeHidden()

  await page.goto('/stock/assets?status=missing')
  await expect(page.getByRole('table', { name: 'Assets' }).getByRole('row').nth(1)).toBeVisible()
})

test('Vic browses assets without bulk actions', async ({ page }) => {
  await signIn(page, persona('vic'))
  await page.goto('/stock/assets')
  const table = page.getByRole('table', { name: 'Assets' })
  await expect(table.getByRole('row').nth(1)).toBeVisible()
  await expect(table.getByRole('checkbox')).toHaveCount(0)
})
