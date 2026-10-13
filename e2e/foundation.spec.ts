import { expect, persona, PERSONAS, signIn, test } from './fixtures'

/**
 * Foundation smoke (demo mode, MSW mock API): personas, permission-filtered navigation,
 * ⌘K, theme/density, every screen inside the shell, 403/404.
 */

for (const who of PERSONAS) {
  test(`${who.name} signs in and sees the right navigation`, async ({ page }) => {
    await signIn(page, who)
    const nav = page.getByRole('navigation', { name: 'Main' })
    const groups = nav.getByRole('group')
    await expect(groups.first()).toHaveAccessibleName(who.groups[0] ?? '')
    for (const label of who.groups) {
      await expect(nav.getByRole('group', { name: label, exact: true })).toBeVisible()
    }
    for (const label of who.hiddenGroups) {
      await expect(nav.getByRole('group', { name: label, exact: true })).toHaveCount(0)
    }
    // the shell knows who is signed in (in the demo the persona pill is the account menu)
    await expect(
      page.getByRole('button', { name: new RegExp(`^${who.name}, demo persona`) }),
    ).toBeVisible()
  })
}

test('deep links survive the login round trip', async ({ page }) => {
  await page.goto('/service-requests?status=invited,escalated&page=2')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await page.getByRole('button', { name: 'Sign in as Dana Dispatcher, Dispatcher' }).click()
  await expect(page).toHaveURL(/\/service-requests\?status=invited,escalated&page=2$/)
  const heading = page.getByRole('heading', { level: 1, name: 'Service requests' })
  await expect(heading).toBeVisible()

  // the session survives a reload
  await page.reload()
  await expect(heading).toBeVisible()
  await expect(page).toHaveURL(/status=invited,escalated/)
})

test('⌘K opens the command palette and jumps to a screen', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  await palette.getByRole('combobox').fill('stock matrix')
  await page.keyboard.press('Enter')
  await expect(palette).toBeHidden()
  await expect(page).toHaveURL(/\/stock\/matrix/)

  // the top-bar search field opens it too
  await page.getByRole('button', { name: /^Search or scan/ }).click()
  await expect(palette).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()
})

test('T toggles the theme, D the density, ? the shortcut help', async ({ page }) => {
  await signIn(page, persona('dana'))
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(html).toHaveAttribute('data-density', 'compact')

  await page.keyboard.press('t')
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.keyboard.press('d')
  await expect(html).toHaveAttribute('data-density', 'comfortable')

  // preferences persist across reloads (no flash: set before first paint)
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await expect(html).toHaveAttribute('data-density', 'comfortable')
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()

  await page.keyboard.press('Shift+?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Dark theme' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
})

const ROUTES: { path: string; title: RegExp }[] = [
  { path: '/pipeline', title: /pipeline/i },
  { path: '/service-requests', title: /service requests/i },
  { path: '/lease-returns', title: /lease returns/i },
  { path: '/communications', title: /communications/i },
  { path: '/dashboard', title: /dashboard/i },
  { path: '/warehouse/installation-places', title: /installation places/i },
  { path: '/warehouse/personalization', title: /personali[sz]ation/i },
  { path: '/warehouse/order-closing', title: /order closing/i },
  { path: '/warehouse/picking', title: /picking/i },
  { path: '/warehouse/parcel-shipping', title: /parcel shipping/i },
  { path: '/stock/matrix', title: /matrix/i },
  { path: '/stock/call-off-orders', title: /call-off orders/i },
  { path: '/stock/call-off-orders/1', title: /call-off order/i },
  { path: '/stock/inventory', title: /inventor/i },
  { path: '/stock/inventory/1', title: /inventor/i },
  { path: '/stock/assets', title: /assets/i },
  { path: '/stock/deactivation', title: /deactivation/i },
  { path: '/admin/dispatch-settings', title: /dispatch settings/i },
]

test('every screen renders inside the shell', async ({ page }) => {
  test.slow()
  await signIn(page, persona('ada'))
  for (const route of ROUTES) {
    await page.goto(route.path)
    await expect(page.getByRole('heading', { level: 1 }), route.path).toHaveText(route.title)
    await expect(page).toHaveTitle(/Hangar/)
  }
})

test('routes without permission show 403, unknown routes 404', async ({ page }) => {
  await signIn(page, persona('theo'))
  await page.goto('/communications')
  await expect(page.getByText("You don't have access to this screen.")).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()

  await page.goto('/does-not-exist')
  await expect(page.getByText("This page doesn't exist.")).toBeVisible()

  await signIn(page, persona('vic'))
  await page.goto('/field/my-tour')
  await expect(page.getByText("You don't have access to this screen.")).toBeVisible()
})

test('the persona switcher signs in as someone else', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.getByRole('button', { name: /demo persona/i }).click()
  await page.getByRole('menuitemradio', { name: /Theo Technician/ }).click()
  await expect(page).toHaveURL(/\/field\/my-tour/)
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('group').first(),
  ).toHaveAccessibleName('Field')
})
