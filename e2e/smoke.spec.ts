import { expect, test } from '@playwright/test'

test('boots in demo mode, guards routes and wires module navigation', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  // Unauthenticated deep link -> login, remembering where to go back to.
  await page.goto('/requests?page=2')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await expect(page.getByRole('heading', { name: 'Hangar' })).toBeVisible()

  // The mock API answers from the service worker.
  const health = await page.evaluate(async () => {
    const response = await fetch('/api/v1/health')
    return await response.json()
  })
  expect(health).toEqual({ status: 'ok', demo: true })

  // Placeholder sign-in returns to the deep link with its typed search params.
  await page.getByRole('button', { name: 'Continue as demo admin' }).click()
  await expect(page).toHaveURL(/\/requests\?page=2$/)
  await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible()
  await expect(page.getByTestId('search-state')).toContainText('"page": 2')

  // Navigation is aggregated from every module's nav.ts.
  const nav = page.getByRole('navigation', { name: 'Main' })
  for (const label of ['Home', 'Requests', 'Staging', 'Field service', 'Stock', 'Imports']) {
    await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible()
  }
  await nav.getByRole('link', { name: 'Stock', exact: true }).click()
  await expect(page).toHaveURL(/\/stock$/)
  await expect(page.getByRole('heading', { name: 'Stock' })).toBeVisible()

  // Session survives a reload (persisted auth store).
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Stock' })).toBeVisible()

  expect(consoleErrors).toEqual([])
})
