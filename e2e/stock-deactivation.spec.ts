import { expect, persona, signIn, test } from './fixtures'

/** H5 deactivation import (SCREENS.md §7.5, #23/#24): CSV upload → confirm → result → history. */

test('Dana deactivates devices from a CSV file', async ({ page }) => {
  await signIn(page, persona('dana'))

  // two serials of devices on lease return + one unknown serial
  await page.goto('/stock/assets?status=collected')
  const table = page.getByRole('table', { name: 'Assets' })
  await expect(table.getByRole('row').nth(2)).toBeVisible()
  const serials: string[] = []
  for (const index of [1, 2]) {
    const cell = table
      .getByRole('row')
      .nth(index)
      .getByRole('cell')
      .filter({ hasText: /^[A-Z0-9]{8,14}$/ })
      .first()
    serials.push(((await cell.textContent()) ?? '').trim())
  }
  expect(serials.length).toBeGreaterThan(0)

  await page.goto('/stock/deactivation')
  await expect(page.getByRole('heading', { level: 1, name: 'Deactivation import' })).toBeVisible()
  const csv = ['serial_number', ...serials, 'ZZNOTFOUND1'].join('\r\n')
  const chooser = page.waitForEvent('filechooser')
  await page.getByText(/CSV or XLSX with a/).click()
  await (
    await chooser
  ).setFiles({
    name: 'lessor-return-e2e.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  })
  await expect(page.getByText('lessor-return-e2e.csv')).toBeVisible()
  await page.getByRole('button', { name: 'Deactivate', exact: true }).click()

  const confirm = page
    .getByRole('alertdialog')
    .or(page.getByRole('dialog', { name: /^Deactivate devices/ }))
  await expect(confirm).toContainText('lessor-return-e2e.csv')
  await confirm.getByRole('button', { name: 'Deactivate' }).click()

  await expect(page).toHaveURL(/[?&]batch=\d+/)
  const result = page.getByText('Result · lessor-return-e2e.csv')
  await expect(result).toBeVisible()
  await expect(page.getByRole('button', { name: 'Not found CSV' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'ZZNOTFOUND1' })).toBeVisible()
  await expect(
    page.getByRole('table', { name: 'Deactivation uploads' }).getByText('lessor-return-e2e.csv'),
  ).toBeVisible()
})

test('Theo and Vic cannot open the deactivation import', async ({ page }) => {
  for (const key of ['theo', 'vic'] as const) {
    await signIn(page, persona(key))
    await page.goto('/stock/deactivation')
    await expect(page.getByText("You don't have access to this screen.")).toBeVisible()
  }
})
