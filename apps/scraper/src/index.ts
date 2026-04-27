import 'dotenv/config'
import { ScraperBrowser } from './scrapers/base.js'
import { takeScreenshots } from './scrapers/screenshots.js'
import { scrapeSeo } from './scrapers/seo.js'
import { scrapePromotions } from './scrapers/promotions.js'
import { scrapePageSpeed } from './scrapers/pagespeed.js'
import { diffPromotions, diffSeo, diffPageSpeed } from './analyzers/diff.js'
import { generateDailyConclusions, generateAlertConclusion, buildAggressivenessRanking } from './analyzers/ai.js'
import { sendAlertEmail, sendDailyReportEmail } from './reporters/email.js'
import {
  getActiveSites, upsertSnapshot, updateSnapshotStatus,
  savePromotions, saveSeoSnapshot, savePageSpeed,
  saveAlert, markAlertEmailSent, saveDailyReport,
  createScrapeLog, updateScrapeLog,
} from './db/queries.js'
import { ensureBucketExists } from './storage/upload.js'
import { logger } from './utils/logger.js'
import { randomDelay } from './utils/retry.js'
import type { Promotion, SeoSnapshot, PageSpeedSnapshot } from '@competencia/shared'
import { mkdir } from 'fs/promises'

async function run(): Promise<void> {
  logger.info('═══════════════════════════════════════════════')
  logger.info('  TeApuesto Intelligence — Inicio de scraping  ')
  logger.info('═══════════════════════════════════════════════')

  // Crear dir de logs si no existe
  await mkdir('logs', { recursive: true })

  const today = new Date().toLocaleDateString('sv', { timeZone: 'America/Lima' })
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('sv', { timeZone: 'America/Lima' })

  const logId = await createScrapeLog(today)
  const steps: unknown[] = []
  const stats = { sitesOk: 0, sitesFailed: 0, totalPromos: 0, totalChanges: 0, alertsSent: 0 }

  // Asegurar que el bucket de storage existe
  await ensureBucketExists()

  const sites = await getActiveSites()
  logger.info(`Sitios a scrapear: ${sites.map(s => s.name).join(', ')}`)

  const browser = new ScraperBrowser()
  await browser.launch()

  // Datos acumulados para el reporte
  const promosBySiteRaw: Record<string, { name: string; promos: Promotion[] }> = {}
  const psiDataRaw: Record<string, { mobile?: PageSpeedSnapshot; desktop?: PageSpeedSnapshot }> = {}
  const seoDataRaw: Record<string, SeoSnapshot> = {}
  const allDiffs: Array<{ siteName: string; type: string; level: string; summary: string }> = []

  for (const site of sites) {
    const siteStart = Date.now()
    logger.info(`\n── Scraping: ${site.name} ──`)

    let snapshot
    try {
      snapshot = await upsertSnapshot(site.id, today)
    } catch (err) {
      logger.error(`[${site.name}] No se pudo crear snapshot: ${(err as Error).message}`)
      continue
    }

    try {
      // 1. Screenshots
      try {
        await takeScreenshots(browser, site, snapshot.id, today)
        steps.push({ site: site.slug, step: 'screenshots', status: 'ok', duration_ms: 0 })
      } catch (err) {
        logger.error(`[${site.name}] screenshots error: ${(err as Error).message}`)
        steps.push({ site: site.slug, step: 'screenshots', status: 'error', error: (err as Error).message, duration_ms: 0 })
      }

      await randomDelay(2000, 4000)

      // 2. SEO
      const seoResult = await scrapeSeo(browser, site, snapshot.id, today)
      if (seoResult) {
        await saveSeoSnapshot(seoResult)
        seoDataRaw[site.slug] = { ...seoResult, id: '', created_at: '' }

        // Diff SEO
        const seoDiffs = await diffSeo(site.id, site.name, { ...seoResult, id: '', created_at: '' }, yesterday)
        for (const diff of seoDiffs) {
          const conclusion = await generateAlertConclusion(site.name, 'seo_change', diff.field, diff.before, diff.after)
          const alertId = await saveAlert({
            site_id: site.id,
            source_type: 'seo',
            alert_level: diff.alertLevel,
            title: `${site.name}: cambio en ${diff.field}`,
            description: `${diff.field}: "${diff.before}" → "${diff.after}"`,
            before_data: { [diff.field]: diff.before },
            after_data: { [diff.field]: diff.after },
            url: site.url,
            conclusion,
          })

          if (diff.alertLevel === 'high') {
            const sent = await sendAlertEmail({
              siteName: site.name,
              alertLevel: diff.alertLevel,
              title: `Cambio en ${diff.field}`,
              description: `El campo SEO "${diff.field}" cambió`,
              summary: `${diff.before} → ${diff.after}`,
              before: { [diff.field]: diff.before },
              after: { [diff.field]: diff.after },
              url: site.url,
              conclusion,
            })
            if (sent) { await markAlertEmailSent(alertId); stats.alertsSent++ }
          }

          allDiffs.push({ siteName: site.name, type: 'seo', level: diff.alertLevel, summary: `SEO ${diff.field}: ${diff.before} → ${diff.after}` })
          stats.totalChanges++
        }
        steps.push({ site: site.slug, step: 'seo', status: 'ok', duration_ms: 0 })
      } else {
        steps.push({ site: site.slug, step: 'seo', status: 'error', error: 'null result', duration_ms: 0 })
      }

      await randomDelay(2000, 4000)

      // 3. Promociones
      const promos = await scrapePromotions(browser, site, snapshot.id, today)
      if (promos.length > 0) {
        await savePromotions(promos)
        promosBySiteRaw[site.slug] = { name: site.name, promos: promos as Promotion[] }
        stats.totalPromos += promos.length

        // Diff promociones
        const promoDiffs = await diffPromotions(
          site.id, site.name, site.slug, site.is_own_brand,
          promos as Promotion[], yesterday, today
        )

        for (const diff of promoDiffs) {
          const conclusion = await generateAlertConclusion(site.name, diff.changeType, diff.summary, diff.before, diff.after)
          const alertId = await saveAlert({
            site_id: site.id,
            source_type: 'promotion',
            alert_level: diff.alertLevel,
            title: `${site.name}: ${diff.summary}`,
            description: diff.summary,
            before_data: diff.before as Record<string, unknown>,
            after_data: diff.after as Record<string, unknown>,
            url: (diff.after as Promotion)?.promo_url ?? site.pages.promotions,
            conclusion,
          })

          if (diff.alertLevel === 'high' || diff.alertLevel === 'medium') {
            const sent = await sendAlertEmail({
              siteName: site.name,
              alertLevel: diff.alertLevel,
              title: diff.summary,
              description: diff.summary,
              summary: diff.summary,
              before: diff.before,
              after: diff.after,
              url: (diff.after as Promotion)?.promo_url ?? site.pages.promotions,
              conclusion,
            })
            if (sent) { await markAlertEmailSent(alertId); stats.alertsSent++ }
          }

          allDiffs.push({ siteName: site.name, type: 'promo', level: diff.alertLevel, summary: diff.summary })
          stats.totalChanges++
        }
        steps.push({ site: site.slug, step: 'promotions', status: 'ok', duration_ms: 0 })
      } else {
        steps.push({ site: site.slug, step: 'promotions', status: 'error', error: '0 promos found', duration_ms: 0 })
      }

      await randomDelay(3000, 6000)

      // 4. PageSpeed
      const psiResults = await scrapePageSpeed(site, snapshot.id, today)
      for (const psi of psiResults) {
        await savePageSpeed(psi)
        if (!psiDataRaw[site.slug]) psiDataRaw[site.slug] = {}
        if (psi.device === 'mobile') psiDataRaw[site.slug].mobile = psi as PageSpeedSnapshot
        if (psi.device === 'desktop') psiDataRaw[site.slug].desktop = psi as PageSpeedSnapshot

        // Diff PageSpeed
        const psiDiffs = await diffPageSpeed(site.id, site.name, psi.device, psi.performance, yesterday)
        for (const diff of psiDiffs) {
          const direction = diff.delta > 0 ? 'mejoró' : 'bajó'
          const alertId = await saveAlert({
            site_id: site.id,
            source_type: 'pagespeed',
            alert_level: diff.alertLevel,
            title: `${site.name}: Performance ${psi.device} ${direction} ${Math.abs(diff.delta)} pts`,
            description: `PageSpeed ${psi.device}: ${diff.before} → ${diff.after} pts`,
            before_data: { performance: diff.before },
            after_data: { performance: diff.after },
          })
          if (diff.alertLevel === 'high') {
            const sent = await sendAlertEmail({
              siteName: site.name,
              alertLevel: 'high',
              title: `Performance ${psi.device} ${direction} ${Math.abs(diff.delta)} pts`,
              description: `PageSpeed ${psi.device}: ${diff.before} → ${diff.after}`,
              summary: `${diff.before} → ${diff.after}`,
              before: { performance: diff.before },
              after: { performance: diff.after },
            })
            if (sent) { await markAlertEmailSent(alertId); stats.alertsSent++ }
          }
          allDiffs.push({ siteName: site.name, type: 'pagespeed', level: diff.alertLevel, summary: `PSI ${psi.device} ${direction} ${Math.abs(diff.delta)}pts` })
          stats.totalChanges++
        }
      }

      const duration = Math.round((Date.now() - siteStart) / 1000)
      await updateSnapshotStatus(snapshot.id, 'success', duration)
      stats.sitesOk++
      logger.info(`[${site.name}] ✓ completado en ${duration}s`)
    } catch (err) {
      const duration = Math.round((Date.now() - siteStart) / 1000)
      const errMsg = (err as Error).message
      await updateSnapshotStatus(snapshot.id, 'failed', duration, errMsg)
      stats.sitesFailed++
      logger.error(`[${site.name}] ✗ falló: ${errMsg}`)
    }

    // Pausa entre sitios para no sobrecargar
    await randomDelay(5000, 10_000)
  }

  await browser.close()

  // ── Reporte diario ─────────────────────────────────────────────────────

  logger.info('\n── Generando reporte diario ──')

  const promosBySiteForAI = Object.fromEntries(
    Object.entries(promosBySiteRaw).map(([k, v]) => [k, v.promos])
  )

  const { conclusions, recommendations, executiveSummary } = await generateDailyConclusions({
    date: today,
    promosBySite: promosBySiteForAI,
    psiData: psiDataRaw,
    seoData: seoDataRaw,
    changesCount: stats.totalChanges,
    ownBrandSlug: 'teapuesto',
  })

  const aggressivenessRanking = buildAggressivenessRanking(promosBySiteRaw)

  await saveDailyReport({
    report_date: today,
    executive_summary: executiveSummary,
    aggressiveness_ranking: aggressivenessRanking,
    new_promos: allDiffs.filter(d => d.type === 'promo'),
    seo_changes_summary: { changes: allDiffs.filter(d => d.type === 'seo') },
    conclusions,
    recommendations,
  })

  await sendDailyReportEmail({
    date: today,
    executiveSummary,
    changesCount: stats.totalChanges,
    alertsCount: stats.alertsSent,
    newPromos: allDiffs.filter(d => d.type === 'promo' && d.level !== 'low').length,
  })

  // ── Finalizar log ──────────────────────────────────────────────────────

  await updateScrapeLog(logId, {
    status: stats.sitesFailed === 0 ? 'success' : stats.sitesOk > 0 ? 'partial' : 'failed',
    sites_ok: stats.sitesOk,
    sites_failed: stats.sitesFailed,
    total_promos: stats.totalPromos,
    total_changes: stats.totalChanges,
    alerts_sent: stats.alertsSent,
    steps_log: steps,
    finished_at: new Date().toISOString(),
  })

  logger.info('\n═══════════════════════════════════════════════')
  logger.info(`  Scraping completado — ${stats.sitesOk} OK, ${stats.sitesFailed} fallidos`)
  logger.info(`  ${stats.totalPromos} promos · ${stats.totalChanges} cambios · ${stats.alertsSent} emails`)
  logger.info('═══════════════════════════════════════════════')
}

run().catch(err => {
  logger.error('Error fatal en run():', err)
  process.exit(1)
})
