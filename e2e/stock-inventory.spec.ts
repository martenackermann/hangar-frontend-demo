import type { Page } from '@playwright/test'
import { expect, persona, signIn, test } from './fixtures'

/**
 * H5 inventory (SCREENS.md §7.3, #25/#27): Theo scans into the open Hillford inventory from ⌘K
 * (match, duplicate = warning, unknown recorded), Dana closes it with corrections.
 */

async function firstMissingSerial(page: Page): Promise<string> {
  const section = page.getByRole('region', { name: 'Reconciliation' })
  await section.getByRole('tab', { name: /^Missing/ }).click()
  const cell = section.getByRole('row').nth(1).getByRole('cell').first()
  await expect(cell).toHaveText(/\w{6,}/)
  return ((await cell.textContent()) ?? '').trim()
}

test('Theo scans into the open inventory; Dana closes it with corrections', async ({ page }) => {
  await signIn(page, persona('theo'))
  await page.keyboard.press('ControlOrMeta+k')
  await page
    .getByRole('dialog', { name: 'Command palette' })
    .getByRole('combobox')
    .fill('inventory scan')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/stock\/inventory\/\d+/)
  await expect(page.getByRole('heading', { level: 1, name: /^Inventory · / })).toBeVisible()

  const serial = await firstMissingSerial(page)
  const input = page.getByRole('textbox', { name: 'Scan serial or asset tag' })
  const verdict = page.getByRole('status').filter({ hasText: serial })

  await input.fill(serial)
  await input.press('Enter')
  await expect(verdict).toContainText(/Matched|OK/)

  // the same serial again is a duplicate (warning), not an error; within 800 ms the input
  // would treat it as a scanner bounce
  await page.waitForTimeout(900)
  await input.fill(serial)
  await input.press('Enter')
  // warnings are announced in the assertive region (role=alert), OK in the polite one
  await expect(page.getByRole('alert').filter({ hasText: 'Already scanned' })).toContainText(serial)

  // an unknown serial is recorded for the unknown report
  await input.fill('ZZE2E00001')
  await input.press('Enter')
  await expect(page.getByRole('alert').filter({ hasText: 'ZZE2E00001' })).toContainText(
    /recorded as unexpected/i,
  )

  // Theo cannot close; Dana can
  await expect(page.getByRole('button', { name: 'Finish & verify' })).toHaveCount(0)
  const url = page.url()
  await signIn(page, persona('dana'))
  await page.goto(url)
  await page.getByRole('button', { name: 'Finish & verify' }).click()
  const dialog = page.getByRole('dialog', { name: /^Close inventory / })
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Close inventory' }).click()
  await expect(page.getByText(/^Inventory .+ closed$/)).toBeVisible()
  await expect(page.getByText(/Corrections applied: \d+ asset records updated\./)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Finish & verify' })).toHaveCount(0)
})

test('Vic sees inventories without scanning', async ({ page }) => {
  await signIn(page, persona('vic'))
  await page.goto('/stock/inventory')
  await expect(page.getByRole('heading', { level: 1, name: 'Inventory' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Start inventory/ })).toHaveCount(0)
})
