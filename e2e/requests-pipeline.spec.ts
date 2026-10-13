import { expect, persona, signIn, test } from './fixtures'

/** H1 · Pipeline board (SCREENS.md §3.1) and the SR drawer it opens. */

test('Dana scans the pipeline and opens a request from a card', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/pipeline')
  await expect(page.getByRole('heading', { level: 1, name: 'Pipeline' })).toBeVisible()

  // one column per open stage, each with its count in the accessible name
  const imported = page.getByRole('region', { name: /^Imported, \d+ requests?$/ })
  await expect(imported).toBeVisible()
  await expect(page.getByRole('region', { name: /^Invited, \d+ requests?$/ })).toBeVisible()

  // a card opens the SR drawer (URL = state)
  const card = imported.getByRole('button', { name: /^SR\d{7}, / }).first()
  const label = (await card.getAttribute('aria-label')) ?? ''
  const number = label.split(',')[0] ?? ''
  await card.click()
  await expect(page).toHaveURL(/[?&]sr=\d+/)
  const drawer = page.getByRole('complementary', { name: `Service request ${number}` })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('tab', { name: /Overview/ })).toBeVisible()
  await drawer.getByRole('tab', { name: /History/ }).click()
  await expect(page).toHaveURL(/[?&]tab=history/)
  await expect(drawer.getByText(/Import/).first()).toBeVisible()

  // Esc closes the drawer
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
})

test('the service request table filters through the URL and opens the drawer', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/service-requests')
  await expect(page.getByRole('heading', { level: 1, name: 'Service requests' })).toBeVisible()

  await page
    .getByRole('navigation', { name: 'Saved views' })
    .getByRole('button', { name: 'Escalated', exact: true })
    .click()
  await expect(page).toHaveURL(/status=escalated/)
  const table = page.getByRole('table', { name: 'Service requests' })
  await expect(table.getByRole('row').nth(1)).toContainText('Escalated')

  await table.getByRole('row').nth(1).click()
  await expect(page).toHaveURL(/[?&]sr=\d+/)
  await expect(page.getByRole('complementary', { name: /^Service request SR\d{7}$/ })).toBeVisible()
})

test('Vic (viewer) sees the board but no communication actions', async ({ page }) => {
  await signIn(page, persona('vic'))
  await page.goto('/service-requests')
  await expect(page.getByRole('heading', { level: 1, name: 'Service requests' })).toBeVisible()
  // no selection column without sr.comms / sr.manage
  await expect(page.getByRole('checkbox', { name: /Select all rows/ })).toHaveCount(0)
})
