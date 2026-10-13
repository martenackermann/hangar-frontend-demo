import { expect, persona, signIn, test } from './fixtures'

/** H1 · workflow actions from the SR and lease drawers (SPEC §4, SCREENS.md §1.5). */

test('Dana sends the next chain mail from the SR drawer', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/service-requests?status=imported')
  const table = page.getByRole('table', { name: 'Service requests' })
  await expect(table.getByRole('row').nth(1)).toContainText('Imported')
  await table.getByRole('row').nth(1).click()

  const drawer = page.getByRole('complementary', { name: /^Service request SR\d{7}$/ })
  await expect(drawer).toBeVisible()
  await drawer.getByRole('tab', { name: /Communication/ }).click()
  const send = drawer.getByRole('tabpanel').getByRole('button', { name: 'Send next mail' })
  await expect(send).toBeEnabled()
  await send.click()

  // the invitation moves the request to Invited and lands in its mail list
  await expect(drawer.getByText('Invited').first()).toBeVisible()
  await expect(drawer.getByRole('list', { name: 'Mails' })).toContainText(
    /Book your hardware appointment/,
  )
})

test('Dana pauses and resumes communication for a request', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/service-requests?status=invited')
  const table = page.getByRole('table', { name: 'Service requests' })
  await table.getByRole('row').nth(1).click()
  const drawer = page.getByRole('complementary', { name: /^Service request SR\d{7}$/ })
  await expect(drawer).toBeVisible()

  const pause = drawer.getByRole('button', { name: 'Pause communication' })
  if (!(await pause.isVisible())) await drawer.getByRole('button', { name: /More/ }).click()
  await page.getByRole('menuitem', { name: 'Pause communication' }).or(pause).first().click()

  const dialog = page.getByRole('dialog', { name: /Pause communication/ })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel(/Reason/).fill('Employee on parental leave')
  await dialog.getByRole('button', { name: /^Pause/ }).click()
  await expect(dialog).toBeHidden()
  await expect(drawer.getByText('Until resumed')).toBeVisible()
  await expect(drawer.getByText('Employee on parental leave')).toBeVisible()

  const resume = drawer.getByRole('button', { name: 'Resume communication' })
  if (!(await resume.isVisible())) await drawer.getByRole('button', { name: /More/ }).click()
  await page.getByRole('menuitem', { name: 'Resume communication' }).or(resume).first().click()
  await expect(drawer.getByText('Until resumed')).toHaveCount(0)
})

test('Dana links a lease return to its replacement order', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/lease-returns?status=info_sent')
  const table = page.getByRole('table', { name: 'Lease returns' })
  await expect(table.getByRole('row').nth(1)).toContainText('Info sent')
  await table.getByRole('row').nth(1).click()

  const drawer = page.getByRole('complementary', { name: /^Lease return GX\d+$/ })
  await expect(drawer).toBeVisible()
  const link = drawer.getByRole('button', { name: 'Link service request' })
  if (!(await link.isVisible())) await drawer.getByRole('button', { name: /More/ }).click()
  await page.getByRole('menuitem', { name: 'Link service request' }).or(link).first().click()

  const dialog = page.getByRole('dialog', { name: /Link service request/ })
  await dialog.getByLabel(/Service request number/).fill('nonsense')
  await dialog.getByRole('button', { name: 'Link' }).click()
  await expect(dialog.getByText('Enter a service request number like SR0012345.')).toBeVisible()

  await dialog.getByLabel(/Service request number/).fill('SR0012290')
  await dialog.getByRole('button', { name: 'Link' }).click()
  await expect(dialog).toBeHidden()
  await expect(drawer.getByText('Replacement ordered').first()).toBeVisible()
  await expect(drawer.getByText('SR0012290').first()).toBeVisible()
})
