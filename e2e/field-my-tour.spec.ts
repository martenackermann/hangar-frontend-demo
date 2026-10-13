import type { Page } from '@playwright/test'
import { expect, persona, signIn, test } from './fixtures'

/**
 * H4 technician flow at phone width (SCREENS.md §6.2–6.3): Theo's tour today, start, deployment
 * scans (keyboard wedge), completion and the protocol.
 */

interface DeploymentItem {
  direction: 'deliver' | 'collect'
  expectedAssetTag: string | null
  asset: { serialNumber: string; assetTag: string | null } | null
}

/** Device codes of a stop, read through the (mock) API with the signed-in session. */
async function deviceCodes(page: Page): Promise<string[]> {
  const [, tourId, stopId] = /\/field\/tours\/(\d+)\/stops\/(\d+)/.exec(page.url()) ?? []
  return page.evaluate(
    async ({ tourId, stopId }) => {
      const token = localStorage.getItem('hangar.token') ?? ''
      const response = await fetch(`/api/v1/tours/${tourId}/stops/${stopId}/deployment`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const view = (await response.json()) as { serviceRequest: { items: DeploymentItem[] } }
      return view.serviceRequest.items
        .filter((item) => item.direction === 'collect' || item.asset !== null)
        .map((item) => item.asset?.assetTag ?? item.asset?.serialNumber ?? item.expectedAssetTag)
        .filter((value): value is string => Boolean(value))
    },
    { tourId: tourId ?? '', stopId: stopId ?? '' },
  )
}

test.use({ viewport: { width: 390, height: 844 } })

test('Theo works through a stop of today’s tour on the phone', async ({ page }) => {
  test.slow()
  await signIn(page, persona('theo'))
  await expect(page).toHaveURL(/\/field\/my-tour/)
  const tour = page.getByRole('region', { name: 'Tour Riverton route' })
  await expect(tour).toBeVisible()
  await expect(page.getByRole('list', { name: 'Stops' }).getByRole('listitem')).toHaveCount(5)

  const start = page.getByRole('button', { name: 'Start tour' })
  if (await start.isVisible()) {
    await start.click()
    await expect(tour.getByText('On the road')).toBeVisible()
  }

  await page.getByRole('link', { name: 'Open' }).first().click()
  await expect(page).toHaveURL(/\/field\/tours\/\d+\/stops\/\d+/)
  await expect(page.getByRole('tab', { name: /Devices/ })).toHaveAttribute('aria-selected', 'true')

  const codes = await deviceCodes(page)
  expect(codes.length).toBeGreaterThan(0)
  const field = page.getByRole('textbox', { name: /Scan device/ })
  for (const [index, code] of codes.entries()) {
    await field.fill(code)
    await field.press('Enter')
    await expect(page.getByText(`${index + 1} of ${codes.length}`, { exact: true })).toBeVisible()
  }

  // unknown device → Register device sheet
  await field.fill('ZZ-NOT-IN-FLEET')
  await field.press('Enter')
  const sheet = page.getByRole('dialog', { name: 'Register device' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Not now' }).click()

  await page.getByRole('tab', { name: 'Finish' }).click()
  await page.getByText('Recipient confirmed the handover').click()
  await page
    .getByRole('tabpanel', { name: 'Finish' })
    .getByRole('button', { name: /^Complete/ })
    .click()
  await expect(page.getByRole('status').filter({ hasText: /completed/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download protocol' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Next stop/ })).toBeVisible()
})

test('Theo reschedules a stop on site with a deviation code', async ({ page }) => {
  await signIn(page, persona('theo'))
  await page.getByRole('link', { name: 'Open' }).nth(1).click()
  await page.getByRole('tab', { name: 'Finish' }).click()
  await page.getByRole('button', { name: 'Reschedule' }).click()
  const dialog = page.getByRole('dialog', { name: /Reschedule SR/ })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('combobox').click()
  await page.getByRole('option', { name: /DV04/ }).click()
  await dialog.getByRole('button', { name: 'Reschedule' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(/This stop is rescheduled/)).toBeVisible()
})
