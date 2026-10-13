import { expect, persona, signIn, test } from './fixtures'

/** H5 stock matrix (SCREENS.md §7.1): buffer edit → order quantity (#18), recalculation. */

test('Dana edits a buffer; the order quantity follows demand + buffer − stock', async ({
  page,
}) => {
  await signIn(page, persona('dana'))
  await page.goto('/stock/matrix')
  await expect(page.getByRole('heading', { level: 1, name: 'Stock matrix' })).toBeVisible()

  const first = page.getByRole('button', { name: / at Eastgate Hub: stock \d+/ }).nth(1)
  const label = (await first.getAttribute('aria-label')) ?? ''
  const match = /^(.+ at Eastgate Hub): stock (\d+), demand (\d+), buffer (\d+)/.exec(label)
  expect(match, label).not.toBeNull()
  const name = match?.[1] ?? ''
  const [stock, demand, buffer] = (match ?? []).slice(2).map(Number) as [number, number, number]
  const cell = page.getByRole('button', { name: `${name}: stock ${stock}` })
  const input = page.getByRole('textbox', { name: `Buffer ${name}`, exact: true })

  const next = buffer + 7
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes('/stock/buffers') && response.request().method() !== 'GET',
  )
  await input.fill(String(next))
  await input.press('Enter')
  expect((await saved).ok()).toBe(true)
  const order = Math.max(0, demand + next - stock)
  // the name ends with the order quantity, then the shortage level when there is one
  await expect(cell).toHaveAttribute(
    'aria-label',
    new RegExp(`buffer ${next}, order ${order}(, shortage .*)?$`),
  )

  // the buffer is stored: it survives a reload (the mock answers a mutation only once the demo
  // database has written it)
  await page.reload()
  await expect(input).toHaveValue(String(next))
})

test('Recalculate runs as a background job and refreshes the matrix', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/stock/matrix')
  await page.getByRole('button', { name: /^Recalculate/ }).click()
  await expect(page.getByText('Stock recalculation finished')).toBeVisible()
  await expect(page.getByText(/Calculated (just now|\d+ (s|sec|seconds?) ago)/)).toBeVisible()
})

test('the hub menu starts a call-off order for that hub', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/stock/matrix')
  await page.getByRole('button', { name: 'Riverton Hub options' }).click()
  await page.getByRole('menuitem', { name: /Create call-off order/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Create call-off order' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('combobox', { name: 'Hub' })).toHaveText(/Riverton/)
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
})

test('Vic sees the matrix read-only', async ({ page }) => {
  await signIn(page, persona('vic'))
  await page.goto('/stock/matrix')
  await expect(page.getByRole('heading', { level: 1, name: 'Stock matrix' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: / at Eastgate Hub: stock \d+/ }).first(),
  ).toBeVisible()
  await expect(page.getByRole('textbox', { name: /^Buffer / })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Recalculate/ })).toHaveCount(0)
})
