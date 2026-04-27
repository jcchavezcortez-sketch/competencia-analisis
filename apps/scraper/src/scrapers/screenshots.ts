import type { Page } from 'playwright'
import type { Site } from '@competencia/shared'
import { uploadScreenshot, buildScreenshotPath } from '../storage/upload.js'
import { db } from '../db/client.js'
import { logger } from '../utils/logger.js'
import { randomDelay } from '../utils/retry.js'
import type { ScraperBrowser } from './base.js'

const PAGE_TYPES: Array<{ key: keyof Site['pages']; label: string }> = [
  { key: 'home', label: 'home' },
  { key: 'promotions', label: 'promotions' },
  { key: 'casino', label: 'casino' },
  { key: 'sports', label: 'sports' },
  { key: 'bonus', label: 'bonus' },
]

export async function takeScreenshots(
  browser: ScraperBrowser,
  site: Site,
  snapshotId: string,
  date: string
): Promise<void> {
  logger.info(`[${site.name}] Tomando screenshots`)
  const page = await browser.newPage()

  try {
    for (const { key, label } of PAGE_TYPES) {
      const url = site.pages[key]
      if (!url) continue

      const ok = await browser.navigateSafe(page, url, `[${site.name}] screenshot:${label}`)
      if (!ok) continue

      try {
        // Scroll para activar lazy-loading
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
        await randomDelay(800, 1500)

        const buffer = await page.screenshot({ fullPage: true, type: 'png' })
        const path = buildScreenshotPath(site.slug, date, label)
        const publicUrl = await uploadScreenshot(buffer, path)

        await db.from('screenshots').insert({
          snapshot_id: snapshotId,
          site_id: site.id,
          snapshot_date: date,
          page_type: label,
          storage_path: path,
          public_url: publicUrl,
          file_size_kb: Math.round(buffer.length / 1024),
          width: 1440,
          height: 900,
        })

        logger.info(`[${site.name}] screenshot:${label} ✓`)
      } catch (err) {
        logger.error(`[${site.name}] screenshot:${label} error — ${(err as Error).message}`)
      }

      await randomDelay(2000, 4000)
    }
  } finally {
    await page.close()
  }
}
