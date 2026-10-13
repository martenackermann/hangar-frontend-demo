import { test as base } from '@playwright/test'
import { expect, persona, signIn } from './fixtures'

/** H1 · Communications (SCREENS.md §4.3) and dispatch settings (§9.5). */

/**
 * Same console check as `fixtures.ts`, minus one message: Playwright's trace recorder tries to
 * inject into the mail preview `iframe sandbox srcdoc` (API.md §4.8) and Chrome logs "Blocked
 * script execution in 'about:srcdoc'". Real users never see it (no scripts run in the frame).
 */
const SANDBOX_NOISE = "Blocked script execution in 'about:srcdoc'"
const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes(SANDBOX_NOISE))
          errors.push(message.text())
      })
      page.on('pageerror', (error) => errors.push(error.message))
      await use(errors)
      expect(errors, 'console errors').toEqual([])
    },
    { auto: true },
  ],
})

test('Dana previews the due mails with a dry run, then sends them', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/communications')
  await expect(page.getByRole('heading', { level: 1, name: 'Communications' })).toBeVisible()
  await expect(page.getByText(/Next run/)).toBeVisible()

  await page.getByRole('button', { name: 'Dry run' }).click()
  const dialog = page.getByRole('dialog', { name: 'Send due mails' })
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/preview=true/)
  await expect(dialog.getByText('Mails', { exact: true })).toBeVisible()
  const send = dialog.getByRole('button', { name: /^Send \d+ mails? now$/ })
  await expect(send).toBeEnabled()
  await send.click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(/mails? sent · \d+ records? skipped/)).toBeVisible({
    timeout: 20_000,
  })

  // the dry run and the manual run are both in the run list
  await page.getByRole('tab', { name: 'Dispatch runs' }).click()
  const runs = page.getByRole('table', { name: 'Dispatch runs' })
  await expect(runs.getByRole('row').nth(1)).toContainText('Manual')
  await expect(runs.getByText('Dry run').first()).toBeVisible()
  await runs.getByRole('row').nth(1).click()
  await expect(page).toHaveURL(/run=\d+/)
  await expect(page.getByRole('complementary', { name: /^Dispatch run / })).toBeVisible()
})

test('the mail log opens the mail preview drawer', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/communications')
  const log = page.getByRole('table', { name: 'Mail log' })
  await expect(log.getByRole('row').nth(1)).toBeVisible()
  await log.getByRole('row').nth(1).click()
  await expect(page).toHaveURL(/[?&]mail=\d+/)
  const drawer = page.getByRole('complementary', { name: /^Mail / })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByTitle(/./).locator('xpath=self::iframe')).toHaveCount(1)
  await drawer.getByRole('radio', { name: 'Text' }).click()
  await expect(drawer.locator('pre')).toBeVisible()
})

test('templates render a preview with a real service request', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/communications?view=templates')
  await page.getByRole('button', { name: 'Preview' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Previews never send a mail.', { exact: false })).toBeVisible()
  await page.goto('/communications?view=templates&template=sr.invitation')
  const preview = page.getByRole('dialog', { name: 'Booking invitation' })
  await preview.getByLabel('Preview with SR…').fill('SR0012290')
  await preview.getByRole('button', { name: 'Render' }).click()
  await expect(preview.getByText('Rendered with SR0012290.', { exact: false })).toBeVisible()
  await expect(preview.getByText(/SR0012290/).first()).toBeVisible()
})

test('dispatch settings validate ranges; Vic can only read them', async ({ page }) => {
  await signIn(page, persona('ada'))
  await page.goto('/admin/dispatch-settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Dispatch settings' })).toBeVisible()
  // lease section first, service requests second
  const reminder = page.getByLabel('Reminder 1').nth(1)
  await reminder.fill('99')
  await reminder.blur()
  await expect(page.getByText('Between 1 and 60.')).toBeVisible()
  await reminder.fill('6')
  await expect(page.getByText(/\+6 d/)).toBeVisible()
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(page.getByText('Dispatch settings saved')).toBeVisible()

  await signIn(page, persona('vic'))
  await page.goto('/admin/dispatch-settings')
  await expect(page.getByText('Read only')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Save/ })).toHaveCount(0)
})
