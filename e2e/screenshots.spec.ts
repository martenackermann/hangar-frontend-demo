import { mkdirSync } from 'node:fs'
import { expect, persona, signIn, test } from './fixtures'

/**
 * Reference screenshots of the foundation (shell + login, both themes) for comparison with
 * the design comps in _spec/hangar/comps/shots. Not part of `pnpm test:e2e`; run
 * `pnpm screenshots` to refresh docs/screenshots/foundation/.
 */
const OUT = 'docs/screenshots/foundation'
mkdirSync(OUT, { recursive: true })

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme })

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => {
        localStorage.setItem(
          'hangar.prefs.v1',
          JSON.stringify({ theme: value, density: 'compact', railCollapsed: false }),
        )
      }, theme)
    })

    test(`login ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/login')
      await expect(page.getByRole('heading', { name: 'Sign in as a demo persona' })).toBeVisible()
      await page.screenshot({ path: `${OUT}/login-1440-${theme}.png` })
      await page.setViewportSize({ width: 390, height: 844 })
      await page.screenshot({ path: `${OUT}/login-390-${theme}.png`, fullPage: true })
    })

    test(`shell ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await signIn(page, persona('dana'))
      await page.mouse.move(0, 899)
      await page.screenshot({ path: `${OUT}/shell-1440-${theme}.png` })

      await page.keyboard.press('ControlOrMeta+k')
      await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
      await page.screenshot({ path: `${OUT}/shell-cmdk-1440-${theme}.png` })
      await page.keyboard.press('Escape')

      await page.keyboard.press('Shift+?')
      await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
      await page.screenshot({ path: `${OUT}/shell-shortcuts-1440-${theme}.png` })
      await page.keyboard.press('Escape')
    })

    test(`403 ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await signIn(page, persona('theo'))
      await page.goto('/communications')
      await expect(page.getByText("You don't have access to this screen.")).toBeVisible()
      await page.screenshot({ path: `${OUT}/shell-403-1440-${theme}.png` })
    })

    test(`technician shell ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await signIn(page, persona('theo'))
      await page.screenshot({ path: `${OUT}/technician-390-${theme}.png` })
    })
  })
}
