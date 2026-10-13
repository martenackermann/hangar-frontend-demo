import { expect, persona, signIn, test } from './fixtures'

/**
 * H4 dispatcher / admin flows (SCREENS.md §6.1, §9.3, §1.5): tour planner week grid and editor,
 * unmatched appointments, sync, calendars admin and the SR drawer tabs.
 */

test.use({ viewport: { width: 1440, height: 900 } })

test('Dana plans tours in the week grid', async ({ page }) => {
  test.slow()
  await signIn(page, persona('dana'))
  await page.goto('/field/tour-planner')
  const grid = page.getByRole('grid', { name: 'Routes by day' })
  await expect(grid).toBeVisible()
  await expect(grid.getByRole('rowheader')).toHaveCount(9)
  await expect(page.getByRole('region', { name: 'Technician lanes' })).toBeVisible()

  // today's Riverton cell opens the editor with Theo's five stops
  await grid
    .getByRole('button', { name: /^Riverton route, .*planned/ })
    .filter({ hasText: /Assigned|On the road/ })
    .first()
    .click()
  const panel = page.getByRole('complementary', { name: 'Planner panel' })
  await expect(panel.getByRole('heading', { name: 'Riverton route' })).toBeVisible()
  await expect(panel.getByRole('list', { name: undefined }).first()).toBeVisible()
  await expect(panel.getByRole('button', { name: /Alt plus arrow keys/ })).toHaveCount(5)

  // keyboard reorder: Alt+↓ moves the first stop down, Save stores the order
  await panel.getByRole('button', { name: /^Stop 1: / }).focus()
  await page.keyboard.press('Alt+ArrowDown')
  await panel.getByRole('button', { name: 'Save tour' }).click()
  await expect(page.getByText(/Tour saved/)).toBeVisible()
  await panel.getByRole('button', { name: 'Close panel' }).click()

  // unmatched appointments: link the first one
  await page.getByRole('button', { name: /^Unmatched/ }).click()
  await expect(panel.getByRole('heading', { name: 'Unmatched appointments' })).toBeVisible()
  await expect(panel.getByRole('listitem')).toHaveCount(5)

  // sync now runs as a job
  await page.getByRole('button', { name: /^Synced|^Sync$/ }).click()
  await panel.getByRole('button', { name: 'Sync now' }).click()
  await expect(page.getByText('Appointment sync finished')).toBeVisible({ timeout: 15_000 })
})

test('Ada manages the booking calendars', async ({ page }) => {
  await signIn(page, persona('ada'))
  await page.goto('/admin/calendars')
  await expect(page.getByRole('heading', { name: 'Calendars', level: 1 })).toBeVisible()
  await expect(page.getByText('Riverton route')).toBeVisible()
  await page.getByRole('switch', { name: 'Oakridge route enabled' }).click()
  await expect(page.getByText('Oakridge route updated')).toBeVisible()
})

test('the SR drawer shows the Appointment and Deployment tabs', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/field/tour-planner')
  const grid = page.getByRole('grid', { name: 'Routes by day' })
  await grid
    .getByRole('button', { name: /^Riverton route, .*planned/ })
    .filter({ hasText: /Assigned|On the road/ })
    .first()
    .click()
  const panel = page.getByRole('complementary', { name: 'Planner panel' })
  // a planned stop (its SR is provided), not one of the day's unplanned candidates
  await panel
    .getByRole('region', { name: 'Stops in order' })
    .getByRole('button', { name: /^\d{2}:\d{2} SR\d{7}/ })
    .first()
    .click()
  const drawer = page.getByRole('complementary', { name: /Service request SR/ })
  await expect(drawer).toBeVisible()
  await drawer.getByRole('tab', { name: 'Appointment' }).click()
  await expect(drawer.getByText('Current appointment')).toBeVisible()
  await expect(drawer.getByText('Appointment history')).toBeVisible()
  await drawer.getByRole('tab', { name: 'Deployment' }).click()
  await expect(drawer.getByText(/Verification ·/)).toBeVisible()
})

test('a viewer reads the planner without editing controls', async ({ page }) => {
  await signIn(page, persona('vic'))
  await page.goto('/field/tour-planner')
  await expect(page.getByRole('grid', { name: 'Routes by day' })).toBeVisible()
  await page.getByRole('button', { name: /^Synced|^Sync$/ }).click()
  await expect(page.getByRole('button', { name: 'Sync now' })).toHaveCount(0)
})
