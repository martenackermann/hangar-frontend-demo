import { expect, persona, signIn, test } from './fixtures'

/** H5 call-off orders (SCREENS.md §7.2): ⌘K → draft from the matrix suggestion → send. */

test('Dana creates a call-off draft from ⌘K and sends it to the logistics partner', async ({
  page,
}) => {
  await signIn(page, persona('dana'))
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await palette.getByRole('combobox').fill('new call-off')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/stock\/call-off-orders\?new=true/)

  const dialog = page.getByRole('dialog', { name: 'Create call-off order' })
  await dialog.getByRole('combobox', { name: 'Hub' }).click()
  await page.getByRole('option', { name: 'Hillford Hub' }).click()
  await dialog.getByRole('button', { name: 'Create draft' }).click()
  await expect(page).toHaveURL(/\/stock\/call-off-orders\/\d+$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Call-off order' })).toBeVisible()
  await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible()

  // a draft without suggested lines gets one by hand
  if (await page.getByText('No lines yet').isVisible()) {
    await page.getByRole('combobox', { name: 'Add article' }).click()
    await page.getByRole('option').first().click()
    await expect(page.getByText('No lines yet')).toBeHidden()
  }
  const quantity = page.getByRole('textbox', { name: /^Quantity / }).first()
  await expect(quantity).toBeVisible()

  await page.getByRole('button', { name: 'Send to Initech Logistics' }).click()
  const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: /^Send / }))
  await confirm.getByRole('button', { name: 'Send order' }).click()
  await expect(page.getByText('Sent', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send to Initech Logistics' })).toHaveCount(0)

  // the list shows it as sent
  await page.getByRole('link', { name: 'All orders' }).click()
  await expect(page).toHaveURL(/\/stock\/call-off-orders$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Call-off orders' })).toBeVisible()
})

test('Vic can read call-off orders but not create one', async ({ page }) => {
  await signIn(page, persona('vic'))
  await page.goto('/stock/call-off-orders')
  await expect(page.getByRole('heading', { level: 1, name: 'Call-off orders' })).toBeVisible()
  await expect(page.getByRole('button', { name: /New call-off order/ })).toHaveCount(0)
})
