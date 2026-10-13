import type { Page } from '@playwright/test'
import { expect, persona, signIn, test } from './fixtures'

/**
 * Cross-slice flows (QA): one service request travels through every slice the way the personas
 * work it — H2 import → H1 pipeline + invitation → H4 booking and sync → H3 personalization,
 * order closing and picking or parcel shipping → H4 tour planning → Theo's deployment with
 * scans → protocol → H1 mail list → H5 assets; plus the H5 dashboard deep links into H1's lists.
 * Runs in demo mode (MSW). Against the real API: start the backend + worker, `pnpm dev`, then
 * `E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:8100/api/v1 pnpm test:e2e
 * e2e/integration-flows.spec.ts` on a freshly seeded database.
 *
 * The browser clock is set to 07:15 (business time) on a working day, so an appointment booked
 * "today at 17:00" is in the future and Theo's tour of that day can be worked whenever the
 * suite runs.
 */

const BUSINESS_TZ = 'Europe/Zurich'

/** 07:15 business time today, or next Monday when today is a weekend. */
function workingMorning(): { at: Date; day: string } {
  let probe = new Date()
  for (;;) {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TZ, weekday: 'short' })
      .format(probe)
      .slice(0, 3)
    if (weekday !== 'Sat' && weekday !== 'Sun') break
    probe = new Date(probe.getTime() + 24 * 3600_000)
  }
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(probe)
  const utcGuess = new Date(`${day}T07:15:00Z`)
  const hourThere = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: BUSINESS_TZ,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(utcGuess),
  )
  return { at: new Date(utcGuess.getTime() - (hourThere - 7) * 3600_000), day }
}

/**
 * SR number and ITSM user id unique per run, so the spec can also run repeatedly against a
 * (stateful) backend. Demo mode resets per test anyway.
 */
function uniqueIds(offset: number): { number: string; userId: string } {
  const base = 9_000_000 + (Math.floor(Date.now() / 1000) % 450_000) * 2 + offset
  return { number: `SR${base}`, userId: `E${base % 1_000_000}` }
}

/** A one-row ITSM service-request export (SPEC §7.2 columns), a new hire with one laptop. */
function srExport(row: {
  number: string
  userId: string
  first: string
  last: string
  zip: string
  city: string
  day: string
}) {
  const header =
    'sr_number,task_number,itsm_state,assignment_group,opened_at,user_id,catalog_item,short_description,order_details,delivery_address,gender,first_name,last_name,email,cost_center'
  const details = [
    '[Procurement type: New hire]',
    '[Scope of delivery: Laptop]',
    '[Client component: Standard laptop]',
    '[New base device type: Laptop Standard 14]',
    '[Software without approval: PDF Reader]',
  ].join(',')
  const address = [
    '[Room: 1.01]',
    '[Building: B1]',
    '[Street: 12 Mill Road]',
    `[Zip: ${row.zip}]`,
    `[City: ${row.city}]`,
    '[Country: Freeland]',
  ].join(',')
  const line = [
    row.number,
    row.number.replace('SR', 'TASK'),
    'New',
    'Client Hardware',
    `${row.day}T06:00:00Z`,
    row.userId,
    'New hire request',
    `New hire for ${row.first} ${row.last}`,
    `"${details}"`,
    `"${address}"`,
    'female',
    row.first,
    row.last,
    `${row.first}.${row.last}@example.com`.toLowerCase(),
    'CC-1001',
  ].join(',')
  return {
    name: `itsm-${row.number}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(`${header}\n${line}\n`, 'utf8'),
  }
}

async function importServiceRequest(page: Page, file: ReturnType<typeof srExport>) {
  await page.goto('/data/imports')
  await page.getByRole('button', { name: /New import/ }).click()
  const wizard = page.getByRole('dialog')
  await wizard.locator('input[type=file]').setInputFiles(file)
  await expect(wizard.getByText('Detected from the column headers.')).toBeVisible()
  await wizard.getByRole('button', { name: 'Continue' }).click()
  await wizard.getByRole('button', { name: 'Start import' }).click()
  await expect(page).toHaveURL(/\/data\/imports\/\d+$/)
  // the detail follows the job until the worker (here: the mock engine) has applied the row
  await expect(page.getByText(/1 of 1 rows processed/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('region', { name: 'Result' })).toContainText(/Created\s*1/)
}

/** ⌘K exact jump: an SR number opens its drawer. */
async function openSr(page: Page, number: string) {
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await palette.getByRole('combobox').fill(number)
  await expect(palette.getByRole('option', { name: new RegExp(number) }).first()).toBeVisible()
  await page.keyboard.press('Enter')
  const drawer = page.getByRole('complementary', { name: `Service request ${number}` })
  await expect(drawer).toBeVisible()
  return drawer
}

async function pipelineCount(page: Page, stage: string): Promise<number> {
  await page.goto('/pipeline')
  const column = page.getByRole('region', { name: new RegExp(`^${stage}, \\d+ requests?$`) })
  const name = (await column.getAttribute('aria-label')) ?? ''
  return Number(/, (\d+) request/.exec(name)?.[1] ?? Number.NaN)
}

async function inviteAndBook(page: Page, number: string) {
  const drawer = await openSr(page, number)
  // H1 · the booking invitation is the first chain mail
  await drawer.getByRole('tab', { name: /Communication/ }).click()
  await drawer.getByRole('tabpanel').getByRole('button', { name: 'Send next mail' }).click()
  await expect(drawer.getByText('Invited').first()).toBeVisible()
  // demo mode sends at once (subject); against the API the worker may still have it queued
  await expect(drawer.getByRole('list', { name: 'Mails' })).toContainText(
    /Book your hardware appointment|Booking invitation/,
  )
  // H4 · the employee books today at 17:00 (dispatcher books on their behalf)
  await drawer.getByRole('button', { name: 'Book appointment' }).click()
  const dialog = page.getByRole('dialog', { name: `Book appointment · ${number}` })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Appointment date' }).click()
  await page.getByRole('button', { name: /^Today / }).click()
  await dialog.getByRole('combobox', { name: 'Time' }).click()
  await page.getByRole('option', { name: '17:00' }).click()
  await dialog.getByRole('button', { name: 'Book appointment' }).click()
  await expect(dialog).toBeHidden()
  await expect(drawer.getByText('Appointment booked').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
}

async function personalize(page: Page, number: string, siteId: number) {
  await page.goto(`/warehouse/personalization?siteId=${siteId}`)
  const queue = page.getByRole('list', { name: 'Requests' })
  await queue.getByRole('button').filter({ hasText: number }).click()
  const panel = page.getByTestId('work-panel')
  await panel.getByRole('button', { name: 'Claim', exact: true }).click()
  await expect(panel.getByText('You are editing')).toBeVisible()
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
  await panel.getByRole('button', { name: 'Finish personalization' }).click()
  await expect(panel.getByText('Personalization done').first()).toBeVisible()
}

async function closeOrder(page: Page, number: string, siteId: number) {
  await page.goto(`/warehouse/order-closing?siteId=${siteId}`)
  const table = page.getByRole('table', { name: 'Orders waiting for closing' })
  await table.getByRole('row').filter({ hasText: number }).click()
  await expect(
    page.getByRole('complementary', { name: 'Order' }).getByText(number).first(),
  ).toBeVisible()
  const checklist = page.getByTestId('software-checklist')
  const boxes = checklist.getByRole('checkbox')
  await expect(boxes.first()).toBeVisible()
  for (let i = 0; i < (await boxes.count()); i++) {
    const box = boxes.nth(i)
    if ((await box.getAttribute('data-state')) !== 'checked') await box.click()
  }
  await expect(checklist.getByText('All software installed.')).toBeVisible()
  await page.getByRole('button', { name: 'Close order', exact: true }).click()
  await expect(page.getByText(new RegExp(`Close order · ${number}`)).first()).toBeVisible()
}

/** API base of the app under test: same origin in demo mode, `E2E_API_URL` against a backend. */
const API_URL = process.env.E2E_API_URL ?? '/api/v1'

/** Device codes of a deployment stop, read through the API with the signed-in session. */
async function deviceCodes(page: Page): Promise<string[]> {
  const [, tourId, stopId] = /\/field\/tours\/(\d+)\/stops\/(\d+)/.exec(page.url()) ?? []
  return page.evaluate(
    async ({ tourId, stopId, api }) => {
      const token = localStorage.getItem('hangar.token') ?? ''
      const response = await fetch(`${api}/tours/${tourId}/stops/${stopId}/deployment`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const view = (await response.json()) as {
        serviceRequest: {
          items: {
            direction: string
            expectedAssetTag: string | null
            asset: { serialNumber: string; assetTag: string | null } | null
          }[]
        }
      }
      return view.serviceRequest.items
        .filter((item) => item.direction === 'collect' || item.asset !== null)
        .map((item) => item.asset?.assetTag ?? item.asset?.serialNumber ?? item.expectedAssetTag)
        .filter((value): value is string => Boolean(value))
    },
    { tourId: tourId ?? '', stopId: stopId ?? '', api: API_URL },
  )
}

test.describe('cross-slice flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: workingMorning().at })
  })

  test('technician delivery: import → invite → booking → sync → staging → picking → tour → deployment → protocol', async ({
    page,
  }) => {
    test.slow()
    const { day } = workingMorning()
    const { number, userId } = uniqueIds(0)
    await page.setViewportSize({ width: 1440, height: 900 })

    // H2 · Dana imports the ITSM export (Riverton, technician delivery); H1 · the pipeline counts it
    await signIn(page, persona('dana'))
    const importedBefore = await pipelineCount(page, 'Imported')
    await importServiceRequest(
      page,
      srExport({
        number,
        userId,
        first: 'Quinn',
        last: 'Larkspur',
        zip: '10020',
        city: 'Riverton',
        day,
      }),
    )
    expect(await pipelineCount(page, 'Imported')).toBe(importedBefore + 1)

    // H1 invitation · H4 booking today at 17:00 on the Riverton route
    await inviteAndBook(page, number)

    // H4 · the appointment sync runs as a job
    await page.goto('/field/tour-planner')
    await page.getByRole('button', { name: /^Synced|^Sync$/ }).click()
    await page
      .getByRole('complementary', { name: 'Planner panel' })
      .getByRole('button', { name: 'Sync now' })
      .click()
    await expect(page.getByText('Appointment sync finished')).toBeVisible({ timeout: 15_000 })

    // H3 · personalization, order closing, technician picking (Riverton hub)
    await personalize(page, number, 1)
    await closeOrder(page, number, 1)
    await page.goto(`/warehouse/picking?siteId=1&date=${day}`)
    const pickRow = page.getByRole('row').filter({ hasText: number })
    await pickRow.getByRole('button', { name: 'Mark provided' }).click()
    await expect(pickRow.getByText('Provided')).toBeVisible()

    // H4 · Dana adds the stop to Theo's Riverton tour of the day
    await page.goto('/field/tour-planner')
    await page
      .getByRole('grid', { name: 'Routes by day' })
      .getByRole('button', { name: /^Riverton route, .*planned/ })
      .filter({ hasText: /Assigned|On the road/ })
      .first()
      .click()
    const panel = page.getByRole('complementary', { name: 'Planner panel' })
    await panel.getByRole('checkbox', { name: `Include ${number}` }).click()
    await panel.getByRole('button', { name: 'Save tour' }).click()
    await expect(page.getByText(/Tour saved/)).toBeVisible()
    await expect(
      panel.getByRole('region', { name: 'Stops in order' }).getByText(number),
    ).toBeVisible()

    // H4 · Theo on the phone: My tour → the new stop → scan → complete → protocol
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, persona('theo'))
    const stop = page.getByRole('list', { name: 'Stops' }).getByRole('listitem').filter({
      hasText: number,
    })
    await expect(stop).toBeVisible()
    const start = page.getByRole('button', { name: 'Start tour' })
    if (await start.isVisible()) {
      await start.click()
      await expect(page.getByText('On the road').first()).toBeVisible()
    }
    await stop.getByRole('link', { name: 'Open' }).click()
    await expect(page).toHaveURL(/\/field\/tours\/\d+\/stops\/\d+/)
    await page.getByRole('tab', { name: /Devices/ }).click()
    const codes = await deviceCodes(page)
    expect(codes.length).toBeGreaterThan(0)
    const field = page.getByRole('textbox', { name: /Scan device/ })
    for (const [index, code] of codes.entries()) {
      await field.fill(code)
      await field.press('Enter')
      await expect(page.getByText(`${index + 1} of ${codes.length}`, { exact: true })).toBeVisible()
    }
    await page.getByRole('tab', { name: 'Finish' }).click()
    await page.getByText('Recipient confirmed the handover').click()
    await page
      .getByRole('tabpanel', { name: 'Finish' })
      .getByRole('button', { name: /^Complete/ })
      .click()
    await expect(page.getByRole('status').filter({ hasText: /completed/ })).toBeVisible()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download protocol' }).click()
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/)

    // Dana: completed, both mails in its list; H5 · the delivered laptop is in use
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, persona('dana'))
    const drawer = await openSr(page, number)
    // status `completed` is shown as the "Deployed" stage
    await expect(drawer.getByText(/Deployed · stage 7 of 8/).first()).toBeVisible()
    await drawer.getByRole('tab', { name: /Communication/ }).click()
    const mails = drawer.getByRole('list', { name: 'Mails' })
    await expect(mails).toContainText(/Book your hardware appointment|Booking invitation/)
    await expect(mails).toContainText(/protocol/i)
    await page.goto(`/stock/assets?q=${encodeURIComponent(codes[0] ?? '')}`)
    await expect(page.getByRole('table').getByText('In use').first()).toBeVisible()
  })

  test('parcel delivery: import → invite → booking → staging → packing → shipment with label and tracking', async ({
    page,
  }) => {
    test.slow()
    const { day } = workingMorning()
    const { number, userId } = uniqueIds(1)
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, persona('dana'))
    // Westbay: parcel to the user, supplied by the Eastgate hub
    await importServiceRequest(
      page,
      srExport({
        number,
        userId,
        first: 'Rowan',
        last: 'Ashdown',
        zip: '50610',
        city: 'Westbay',
        day,
      }),
    )
    await inviteAndBook(page, number)
    await personalize(page, number, 3)
    await closeOrder(page, number, 3)

    await page.goto('/warehouse/parcel-shipping?siteId=3')
    await page
      .getByRole('list', { name: 'Parcel orders' })
      .getByRole('button')
      .filter({ hasText: number })
      .click()
    const items = page.getByRole('list', { name: 'Items to pack' })
    const tags = await items.locator('li .hg-mono').allTextContents()
    expect(tags.length).toBeGreaterThan(0)
    const scan = page.getByTestId('pack-scan').getByRole('textbox')
    for (const tag of tags) {
      await scan.fill(tag.trim())
      await scan.press('Enter')
      await expect(page.getByText(/Packed|Already packed/).first()).toBeVisible()
      await page.waitForTimeout(300)
    }
    const label = page.waitForEvent('download').catch(() => null)
    await page.getByRole('button', { name: 'Create shipment' }).click()
    await expect(page.getByTestId('shipment-result')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Tracking parcel 1' }).first()).toBeVisible()
    await label

    const drawer = await openSr(page, number)
    await expect(drawer.getByText('Shipped').first()).toBeVisible()
  })

  test('dashboard tiles deep-link into the lists with matching counts', async ({ page }) => {
    test.slow()
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, persona('dana'))
    const cases: { tile: RegExp; url: RegExp; heading: string }[] = [
      {
        tile: /^Escalated/,
        url: /\/service-requests\?.*status=escalated/,
        heading: 'Service requests',
      },
      {
        tile: /^Appointments today/,
        url: /\/service-requests\?.*appointmentFrom=/,
        heading: 'Service requests',
      },
      {
        tile: /^Completed this week/,
        url: /\/service-requests\?.*closedFrom=/,
        heading: 'Service requests',
      },
      { tile: /^Needs attention/, url: /needsAttention=true/, heading: 'Service requests' },
      {
        tile: /^Hardware unavailable/,
        url: /\/service-requests\?.*status=hardware_unavailable/,
        heading: 'Service requests',
      },
      {
        tile: /^Lease returns due in 30 days/,
        url: /\/lease-returns\?.*retirementTo=/,
        heading: 'Lease returns',
      },
    ]
    for (const { tile, url, heading } of cases) {
      await page.goto('/dashboard')
      const link = page.getByRole('link', { name: tile }).first()
      const value = Number(
        ((await link.locator('.text-2xl').first().textContent()) ?? '').replace(/\D/g, ''),
      )
      await link.click()
      await expect(page).toHaveURL(url)
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
      const count = page.locator('[aria-live="polite"] b').first()
      await expect(count, `${tile} count`).toHaveText(new Intl.NumberFormat('en').format(value))
    }
    // stock and inventory tiles land on H5's own screens
    await page.goto('/dashboard')
    await page.getByRole('link', { name: /^Open inventories/ }).click()
    await expect(page).toHaveURL(/\/stock\/inventory\?.*status=open/)
    await page.goto('/dashboard')
    await page.getByRole('link', { name: /^Stock shortfall/ }).click()
    await expect(page).toHaveURL(/\/stock\/matrix/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('demo app shell: deep link through login, reload, service worker + mock API, reset demo data', async ({
    page,
  }) => {
    test.slow()
    await page.setViewportSize({ width: 1440, height: 900 })
    // a deep link survives the login round trip and a reload (SPA rewrite + service worker)
    await page.goto('/service-requests?status=imported')
    await expect(page).toHaveURL(/\/login\?redirect=/)
    await page.getByRole('button', { name: 'Sign in as Ada Admin, Admin' }).click()
    await expect(page).toHaveURL(/\/service-requests\?status=imported$/)
    const table = page.getByRole('table', { name: 'Service requests' })
    await expect(table.getByRole('row').nth(1)).toContainText('Imported')
    await page.reload()
    await expect(table.getByRole('row').nth(1)).toContainText('Imported')
    // one service worker controls the page (PWA worker in builds, MSW's in dev) and the API still
    // answers from the in-browser database
    const worker = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)
    expect(worker).toMatch(/\/(sw|mockServiceWorker)\.js$/)

    // a change survives a reload; "Reset demo data" brings the fixture back
    const number = (
      (await table
        .getByRole('row')
        .nth(1)
        .getByText(/^SR\d{7}$/)
        .first()
        .textContent()) ?? ''
    ).trim()
    expect(number).toMatch(/^SR\d{7}$/)
    await table.getByRole('row').nth(1).click()
    const drawer = page.getByRole('complementary', { name: `Service request ${number}` })
    await drawer.getByRole('tab', { name: /Communication/ }).click()
    await drawer.getByRole('tabpanel').getByRole('button', { name: 'Send next mail' }).click()
    await expect(drawer.getByText('Invited').first()).toBeVisible()
    await page.reload()
    await expect(
      page
        .getByRole('complementary', { name: `Service request ${number}` })
        .getByText('Invited')
        .first(),
    ).toBeVisible()

    await page.keyboard.press('ControlOrMeta+k')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await palette.getByRole('combobox').fill('reset demo data')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Demo data reset').first()).toBeVisible({ timeout: 15_000 })
    const after = await openSr(page, number)
    await expect(after.getByText('Imported').first()).toBeVisible()
  })

  test('permissions across slices: Vic reads, Theo works his tour, neither manages', async ({
    page,
  }) => {
    test.slow()
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, persona('vic'))
    for (const path of ['/dashboard', '/stock/matrix', '/data/imports', '/field/tour-planner']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 }), path).toBeVisible()
    }
    await page.goto('/data/imports')
    await expect(page.getByRole('heading', { level: 1, name: 'Imports' })).toBeVisible()
    await expect(page.getByRole('button', { name: /New import/ })).toHaveCount(0)
    await page.goto('/warehouse/personalization?queue=all')
    await page.getByRole('list', { name: 'Requests' }).getByRole('button').first().click()
    await expect(
      page.getByTestId('work-panel').getByRole('button', { name: 'Claim', exact: true }),
    ).toHaveCount(0)
    await page.goto('/stock/call-off-orders')
    await expect(page.getByRole('heading', { level: 1, name: /Call-off orders/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /New call-off/ })).toHaveCount(0)
    await page.goto('/communications')
    await expect(page.getByRole('heading', { level: 1, name: 'Communications' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dry run' })).toHaveCount(0)

    await signIn(page, persona('theo'))
    await page.goto('/admin/users')
    await expect(page.getByText("You don't have access to this screen.")).toBeVisible()
    await page.goto('/data/imports')
    await expect(page.getByText("You don't have access to this screen.")).toBeVisible()
    await page.goto('/stock/inventory')
    await expect(page.getByRole('heading', { level: 1, name: 'Inventory' })).toBeVisible()
  })
})
