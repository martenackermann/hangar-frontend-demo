/**
 * Render the PWA / touch icons from public/favicon.svg with Playwright's Chromium.
 *   node scripts/generate-icons.ts
 * Phase 2b: replace favicon.svg with the designed mark, update BACKGROUND, rerun.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const BACKGROUND = '#0f172a'
const publicDir = fileURLToPath(new URL('../public/', import.meta.url))

const targets = [
  { file: 'pwa-192x192.png', size: 192, inset: 0 },
  { file: 'pwa-512x512.png', size: 512, inset: 0 },
  // Maskable icons need the mark inside the central 80% "safe zone".
  { file: 'pwa-maskable-512x512.png', size: 512, inset: 0.12 },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.08 },
]

const svg = await readFile(`${publicDir}favicon.svg`, 'utf8')
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
