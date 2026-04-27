import Anthropic from '@anthropic-ai/sdk'
import type { Site, Promotion, PromoType } from '@competencia/shared'
import { logger } from '../utils/logger.js'
import { randomDelay } from '../utils/retry.js'
import type { ScraperBrowser } from './base.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Limitar HTML para no gastar tokens: 80k chars máximo
const MAX_HTML_CHARS = 80_000

const SYSTEM_PROMPT = `Eres un analista de marketing de casinos y apuestas deportivas en Perú.
Recibirás el HTML de una página de promociones de un sitio de apuestas peruano.
Tu tarea es extraer TODAS las promociones visibles y devolverlas como JSON.`

function buildUserPrompt(html: string, siteName: string): string {
  return `Extrae todas las promociones de ${siteName} del siguiente HTML.

Para cada promoción devuelve un objeto con estos campos (usa null si no está disponible):
- promo_type: uno de [registro, casino, deportes, freebet, freespin, cashback, torneo, mision, codigo, otro]
- title: título de la promoción
- description: descripción breve (máx 300 chars)
- bonus_pct: porcentaje del bono (número, ej: 100 para 100%)
- max_bonus: monto máximo del bono en PEN (número, ej: 500)
- min_deposit: depósito mínimo en PEN (número)
- rollover: requisito de apuesta (ej: "x35" o el texto visible)
- validity: vigencia si está mencionada
- promo_url: URL específica de la promo si aparece en los links

Responde ÚNICAMENTE con un array JSON válido. Sin texto adicional. Sin markdown.
Ejemplo: [{"promo_type":"registro","title":"Bono Bienvenida","bonus_pct":100,"max_bonus":200,...}]

HTML:
${html.substring(0, MAX_HTML_CHARS)}`
}

export async function scrapePromotions(
  browser: ScraperBrowser,
  site: Site,
  snapshotId: string,
  date: string
): Promise<Omit<Promotion, 'id' | 'created_at'>[]> {
  logger.info(`[${site.name}] Scraping promociones`)
  const page = await browser.newPage()

  try {
    const ok = await browser.navigateSafe(page, site.pages.promotions, `[${site.name}] promos`)
    if (!ok) return []

    // Scroll completo para activar lazy loading
    await page.evaluate(async () => {
      for (let i = 0; i < 5; i++) {
        window.scrollBy(0, window.innerHeight)
        await new Promise(r => setTimeout(r, 600))
      }
    })
    await randomDelay(1500, 2500)

    // Extraer HTML del contenido principal
    const html = await page.evaluate(() => {
      // Eliminar scripts, estilos y headers/footers para reducir tokens
      const clone = document.cloneNode(true) as Document
      clone.querySelectorAll('script, style, nav, footer, header').forEach(el => el.remove())
      return clone.body?.innerHTML ?? document.body.innerHTML
    })

    if (!html || html.length < 500) {
      logger.warn(`[${site.name}] HTML de promociones muy corto, posible bloqueo`)
      return []
    }

    // Llamar a Claude Haiku para extraer estructura
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(html, site.name) }],
    })

    const rawText = message.content[0].type === 'text' ? message.content[0].text : ''

    let parsed: Partial<Promotion>[]
    try {
      // Limpiar posibles marcadores markdown que el modelo a veces agrega
      const cleaned = rawText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
      parsed = JSON.parse(cleaned)
      if (!Array.isArray(parsed)) parsed = []
    } catch {
      logger.warn(`[${site.name}] No se pudo parsear JSON de Claude: ${rawText.substring(0, 200)}`)
      return []
    }

    const promos: Omit<Promotion, 'id' | 'created_at'>[] = parsed
      .filter(p => p.title || p.description)
      .map(p => ({
        snapshot_id: snapshotId,
        site_id: site.id,
        snapshot_date: date,
        promo_type: (p.promo_type as PromoType) ?? 'otro',
        title: p.title ?? null,
        description: p.description ?? null,
        bonus_pct: typeof p.bonus_pct === 'number' ? p.bonus_pct : null,
        max_bonus: typeof p.max_bonus === 'number' ? p.max_bonus : null,
        min_deposit: typeof p.min_deposit === 'number' ? p.min_deposit : null,
        currency: 'PEN',
        rollover: p.rollover ?? null,
        validity: p.validity ?? null,
        promo_url: p.promo_url ?? site.pages.promotions,
        raw_content: null,
        is_active: true,
        is_false_positive: false,
        manually_edited: false,
      }))

    logger.info(`[${site.name}] Promociones ✓ — ${promos.length} encontradas`)
    return promos
  } catch (err) {
    logger.error(`[${site.name}] Promociones error — ${(err as Error).message}`)
    return []
  } finally {
    await page.close()
  }
}
