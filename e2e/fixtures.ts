import { expect, test as base, type Page } from '@playwright/test'

export interface PersonaCase {
  key: 'dana' | 'theo' | 'vic' | 'ada'
  name: string
  role: string
  home: string
  groups: string[]
  hiddenGroups: string[]
}

/** The four primary demo personas (SPEC §11) and what their rail must show (SCREENS.md §1.2). */
export const PERSONAS: PersonaCase[] = [
  {
    key: 'dana',
    name: 'Dana Dispatcher',
    role: 'Dispatcher',
    home: '/pipeline',
    groups: ['Overview', 'Requests', 'Warehouse', 'Field', 'Stock', 'Data'],
    hiddenGroups: ['Admin'],
  },
  {
    key: 'theo',
    name: 'Theo Technician',
    role: 'Technician',
    home: '/field/my-tour',
    groups: ['Field', 'Overview', 'Requests', 'Warehouse', 'Stock'],
    hiddenGroups: ['Data', 'Admin'],
  },
  {
    key: 'vic',
    name: 'Vic Viewer',
    role: 'Viewer',
    home: '/pipeline',
    groups: ['Overview', 'Requests', 'Warehouse', 'Field', 'Stock', 'Data'],
    hiddenGroups: ['Admin'],
  },
  {
    key: 'ada',
    name: 'Ada Admin',
    role: 'Admin',
    home: '/pipeline',
    groups: ['Overview', 'Requests', 'Warehouse', 'Field', 'Stock', 'Data', 'Admin'],
    hiddenGroups: [],
  },
]

export function persona(key: PersonaCase['key']): PersonaCase {
  const found = PERSONAS.find((p) => p.key === key)
  if (!found) throw new Error(`unknown persona ${key}`)
  return found
}

/** Signs in through the persona picker on /login and waits for the home screen. */
export async function signIn(page: Page, who: PersonaCase): Promise<void> {
  if (page.url().startsWith('http')) {
    // signed in already: drop the session, otherwise /login redirects home
    await page.evaluate(() => {
      localStorage.removeItem('hangar.token')
      localStorage.removeItem('hangar.session.v1')
    })
  }
  await page.goto('/login')
  await page.getByRole('button', { name: `Sign in as ${who.name}, ${who.role}` }).click()
  await expect(page).toHaveURL(new RegExp(`${who.home.replace(/\//g, '\\/')}(\\?|$)`))
  // the shell is up (the rail is a sheet on phones, so look for the shell's <main id="main">)
  await expect(page.locator('main#main')).toBeVisible()
}

/** Fails the test on console errors and uncaught exceptions. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      page.on('pageerror', (error) => errors.push(error.message))
      await use(errors)
      expect(errors, 'console errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
