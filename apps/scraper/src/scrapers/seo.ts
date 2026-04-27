import type { Page } from 'playwright'
import type { Site, SeoSnapshot } from '@competencia/shared'
import { logger } from '../utils/logger.js'
import type { ScraperBrowser } from './base.js'

export async function scrapeSeo(
  browser: ScraperBrowser,
  site: Site,
  snapshotId: string,
  date: string
): Promise<Omit<SeoSnapshot, 'id' | 'created_at'> | null> {
  logger.info(`[${site.name}] Scraping SEO`)
  const page = await browser.newPage()

  try {
    const ok = await browser.navigateSafe(page, site.url, `[${site.name}] seo`)
    if (!ok) return null

    const data = await page.evaluate(() => {
      const getMeta = (name: string): string | null =>
        document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ??
        document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ?? null

      const schemaScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      const schemaTypes: string[] = []
      for (const s of schemaScripts) {
        try {
          const parsed = JSON.parse(s.textContent ?? '')
          const t = parsed['@type']
          if (t) schemaTypes.push(Array.isArray(t) ? t[0] : t)
        } catch { /* ignorar JSON malformado */ }
      }

      const robotsMeta = getMeta('robots')
      const isIndexable = !robotsMeta?.includes('noindex')

      return {
        title: document.title ?? null,
        meta_description: getMeta('description'),
        h1: document.querySelector('h1')?.textContent?.trim() ?? null,
        h2s: Array.from(document.querySelectorAll('h2'))
          .map(h => h.textContent?.trim() ?? '')
          .filter(Boolean)
          .slice(0, 10),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
        robots_meta: robotsMeta,
        has_schema: schemaScripts.length > 0,
        schema_types: schemaTypes,
        is_indexable: isIndexable,
      }
    })

    // Verificar robots.txt
    let robotsTxtAccessible = false
    try {
      const robotsUrl = new URL('/robots.txt', site.url).href
      const res = await page.request.get(robotsUrl, { timeout: 8000 })
      robotsTxtAccessible = res.ok()
    } catch { /* ignorar */ }

    // Detectar sitemap
    let sitemapUrl: string | null = null
    try {
      const sitemapRes = await page.request.get(new URL('/sitemap.xml', site.url).href, { timeout: 8000 })
      if (sitemapRes.ok()) sitemapUrl = new URL('/sitemap.xml', site.url).href
    } catch { /* ignorar */ }

    logger.info(`[${site.name}] SEO ✓ — title: "${data.title?.substring(0, 50)}"`)

    return {
      snapshot_id: snapshotId,
      site_id: site.id,
      snapshot_date: date,
      url_checked: site.url,
      ...data,
      robots_txt_accessible: robotsTxtAccessible,
      sitemap_url: sitemapUrl,
    }
  } catch (err) {
    logger.error(`[${site.name}] SEO error — ${(err as Error).message}`)
    return null
  } finally {
    await page.close()
  }
}
