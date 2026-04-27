import type { Site, PageSpeedSnapshot, Device } from '@competencia/shared'
import { logger } from '../utils/logger.js'
import { sleep } from '../utils/retry.js'

const PSI_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
const API_KEY = process.env.GOOGLE_PAGESPEED_API_KEY

interface PsiResponse {
  lighthouseResult?: {
    categories: Record<string, { score: number }>
    audits: Record<string, {
      numericValue?: number
      displayValue?: string
      score?: number | null
      title?: string
      description?: string
      details?: { type?: string; items?: unknown[] }
    }>
  }
}

function extractScore(result: PsiResponse, category: string): number | null {
  const score = result.lighthouseResult?.categories[category]?.score
  return score !== undefined ? Math.round(score * 100) : null
}

function extractMetric(result: PsiResponse, audit: string): number | null {
  const val = result.lighthouseResult?.audits[audit]?.numericValue
  return val !== undefined ? Math.round(val) : null
}

function extractOpportunities(result: PsiResponse) {
  const audits = result.lighthouseResult?.audits ?? {}
  return Object.entries(audits)
    .filter(([, v]) => v.details?.type === 'opportunity' && (v.numericValue ?? 0) > 500)
    .map(([id, v]) => ({
      id,
      title: v.title ?? id,
      savings_ms: v.numericValue ? Math.round(v.numericValue) : undefined,
      description: v.description,
    }))
    .slice(0, 8)
}

export async function scrapePageSpeed(
  site: Site,
  snapshotId: string,
  date: string
): Promise<Array<Omit<PageSpeedSnapshot, 'id' | 'created_at'>>> {
  if (!API_KEY) {
    logger.warn('GOOGLE_PAGESPEED_API_KEY no configurado')
    return []
  }

  const results: Array<Omit<PageSpeedSnapshot, 'id' | 'created_at'>> = []

  for (const device of ['mobile', 'desktop'] as Device[]) {
    try {
      logger.info(`[${site.name}] PageSpeed ${device}`)
      const url = `${PSI_BASE}?url=${encodeURIComponent(site.url)}&strategy=${device}&key=${API_KEY}`
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })

      if (!res.ok) {
        logger.warn(`[${site.name}] PSI ${device} HTTP ${res.status}`)
        continue
      }

      const data: PsiResponse = await res.json()

      results.push({
        snapshot_id: snapshotId,
        site_id: site.id,
        snapshot_date: date,
        device,
        url_checked: site.url,
        performance: extractScore(data, 'performance'),
        seo: extractScore(data, 'seo'),
        accessibility: extractScore(data, 'accessibility'),
        best_practices: extractScore(data, 'best-practices'),
        lcp: extractMetric(data, 'largest-contentful-paint'),
        inp: extractMetric(data, 'interaction-to-next-paint'),
        cls: data.lighthouseResult?.audits['cumulative-layout-shift']?.numericValue ?? null,
        fcp: extractMetric(data, 'first-contentful-paint'),
        speed_index: extractMetric(data, 'speed-index'),
        tbt: extractMetric(data, 'total-blocking-time'),
        opportunities: extractOpportunities(data),
        diagnostics: [],
      })

      logger.info(`[${site.name}] PSI ${device} ✓ — perf: ${results.at(-1)?.performance}`)

      // Respetar rate limit de PSI API (25k/día pero throttlean con frecuencia)
      await sleep(2500)
    } catch (err) {
      logger.error(`[${site.name}] PSI ${device} error — ${(err as Error).message}`)
    }
  }

  return results
}
