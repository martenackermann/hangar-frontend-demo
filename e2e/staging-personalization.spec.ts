import { expect, persona, signIn, test } from './fixtures'

/**
 * H3 · Personalization (SCREENS.md §5.2): Dana claims the first unclaimed request, assigns
 * every new device by scanning the FIFO suggestion and finishes; the viewer sees it read-only.
 */
test('dispatcher claims, assigns by scan and finishes personalization', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/warehouse/personalization')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Personalization')

  const queue = page.getByRole('list', { name: 'Requests' })
  await expect(queue.getByRole('button').first()).toBeVisible()
  // pick a request whose devices are all in stock (green dots only)
  const candidates = queue.getByRole('button').filter({ hasNotText: 'none in staging' })
  await candidates.first().click()

  const panel = page.getByTestId('work-panel')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 'Claim', exact: true }).click()
  await expect(panel.getByText('You are editing')).toBeVisible()
  await page.screenshot({ path: 'docs/screenshots/staging/personalization-claimed.png' })

  const scan = panel.getByTestId('assign-scan').getByRole('textbox')
  for (let round = 0; round < 3; round++) {
    const suggestion = panel.getByTestId('suggested-asset').first()
    if (!(await suggestion.isVisible().catch(() => false))) break
    const serial = (await suggestion.locator('.hg-mono.text-xs').first().textContent())?.trim()
    expect(serial).toBeTruthy()
    await scan.fill(serial ?? '')
    await scan.press('Enter')
    await expect(panel.getByText(/Assigned|Not the oldest/).first()).toBeVisible()
    await page.waitForTimeout(400)
  }
  await page.screenshot({ path: 'docs/screenshots/staging/personalization-assigned.png' })

  const finish = panel.getByRole('button', { name: 'Finish personalization' })
  await expect(finish).toBeEnabled()
  await finish.click()
  await expect(panel.getByText('Personalization done').first()).toBeVisible()
})

test('viewer sees the queue read-only', async ({ page }) => {
  await signIn(page, persona('vic'))
  await page.goto('/warehouse/personalization?queue=all')
  const queue = page.getByRole('list', { name: 'Requests' })
  await queue.getByRole('button').first().click()
  const panel = page.getByTestId('work-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Claim', exact: true })).toHaveCount(0)
  await expect(panel.getByTestId('assign-scan')).toHaveCount(0)
})
