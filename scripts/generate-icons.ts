/**
 * Render the PWA / touch icons from public/icon.svg (full-bleed artwork) with Playwright's
 * Chromium:  pnpm icons:gen
 * The favicon is public/favicon.svg (same mark, rounded corners) and is used as is.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

/** Signal amber: the icon tile colour (DESIGN.md §2.2). */
const BACKGROUND = '#FFB224'
const publicDir = fileURLToPath(new URL('../public/', import.meta.url))

const targets = [
  { file: 'pwa-192x192.png', size: 192, inset: 0 },
  { file: 'pwa-512x512.png', size: 512, inset: 0 },
  // Maskable icons need the mark inside the central 80 % "safe zone".
  { file: 'pwa-maskable-512x512.png', size: 512, inset: 0.14 },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.06 },
]

const svg = await readFile(`${publicDir}icon.svg`, 'utf8')
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  for (const { file, size, inset } of targets) {
    const pad = Math.round(size * inset)
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(
      `<html><body style="margin:0;background:${BACKGROUND}">
        <div style="box-sizing:border-box;width:${size}px;height:${size}px;padding:${pad}px">
          ${svg.replace('<svg ', '<svg width="100%" height="100%" ')}
        </div>
      </body></html>`,
    )
    await page.screenshot({
      path: `${publicDir}${file}`,
      clip: { x: 0, y: 0, width: size, height: size },
    })
    console.info(`wrote public/${file}`)
  }
} finally {
  await browser.close()
}
