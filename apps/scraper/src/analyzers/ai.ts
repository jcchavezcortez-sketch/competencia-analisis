import Anthropic from '@anthropic-ai/sdk'
import type { Promotion, PageSpeedSnapshot, SeoSnapshot, AggressivenessEntry } from '@competencia/shared'
import { logger } from '../utils/logger.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Conclusiones del reporte diario ───────────────────────────────────────

export async function generateDailyConclusions(params: {
  date: string
  promosBySite: Record<string, Promotion[]>
  psiData: Record<string, { mobile?: PageSpeedSnapshot; desktop?: PageSpeedSnapshot }>
  seoData: Record<string, SeoSnapshot>
  changesCount: number
  ownBrandSlug: string
}): Promise<{ conclusions: string; recommendations: string; executiveSummary: string }> {
  const { date, promosBySite, psiData, changesCount, ownBrandSlug } = params

  const promoSummary = Object.entries(promosBySite)
    .map(([site, promos]) => {
      const main = promos.find(p => p.promo_type === 'registro')
      return `${site}: ${promos.length} promos. Principal bienvenida: ${main?.title ?? 'no detectada'} (bono máx: S/${main?.max_bonus ?? '?'})`
    })
    .join('\n')

  const psiSummary = Object.entries(psiData)
    .map(([site, d]) => `${site} mobile: ${d.mobile?.performance ?? '?'}/100, desktop: ${d.desktop?.performance ?? '?'}/100`)
    .join('\n')

  const prompt = `Eres analista de marketing digital para TeApuesto.pe, casa de apuestas en Perú.
Analiza el estado competitivo del día ${date} y genera conclusiones accionables.

PROMOCIONES POR SITIO:
${promoSummary}

PAGESPEED (performance score):
${psiSummary}

TOTAL DE CAMBIOS DETECTADOS HOY: ${changesCount}

Genera un JSON con exactamente estas 3 claves (sin más):
{
  "executiveSummary": "Resumen de 2-3 oraciones de lo más importante del día",
  "conclusions": "Análisis de 4-6 párrafos: qué están haciendo los competidores, quién es más agresivo, cómo está TeApuesto vs la competencia. Directo y práctico, sin frases corporativas.",
  "recommendations": "3-5 recomendaciones concretas numeradas para el equipo de TeApuesto: captación, SEO, performance, respuesta competitiva. Cada una en 1-2 oraciones."
}

Responde ÚNICAMENTE con el JSON válido, sin markdown ni texto adicional.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(cleaned)

    return {
      conclusions: parsed.conclusions ?? '',
      recommendations: parsed.recommendations ?? '',
      executiveSummary: parsed.executiveSummary ?? '',
    }
  } catch (err) {
    logger.error(`generateDailyConclusions error: ${(err as Error).message}`)
    return {
      conclusions: 'No se pudieron generar conclusiones automáticas.',
      recommendations: 'Revisa el dashboard para ver los cambios detectados.',
      executiveSummary: `Se detectaron ${changesCount} cambios en el análisis del ${date}.`,
    }
  }
}

// ── Conclusión de alerta específica ───────────────────────────────────────

export async function generateAlertConclusion(
  siteName: string,
  changeType: string,
  summary: string,
  before: unknown,
  after: unknown
): Promise<string> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Genera UNA conclusión accionable (máx 2 oraciones) para el equipo de TeApuesto.pe sobre este cambio de competidor:
Sitio: ${siteName}
Cambio: ${summary}
Antes: ${JSON.stringify(before)}
Después: ${JSON.stringify(after)}
Responde solo la conclusión, sin formato.`,
      }],
    })
    return message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  } catch {
    return ''
  }
}

// ── Ranking de agresividad ─────────────────────────────────────────────────

export function buildAggressivenessRanking(
  promosBySite: Record<string, { name: string; promos: Promotion[] }>
): AggressivenessEntry[] {
  return Object.entries(promosBySite)
    .map(([slug, { name, promos }]) => {
      const maxBonus = Math.max(...promos.map(p => p.max_bonus ?? 0), 0) || null
      const hasRegistro = promos.some(p => p.promo_type === 'registro')
      const hasFreebet = promos.some(p => p.promo_type === 'freebet')

      // Score simple: cantidad de promos + bono máximo normalizado
      let score = promos.length * 10
      if (maxBonus) score += Math.min(maxBonus / 10, 50)
      if (hasRegistro) score += 20
      if (hasFreebet) score += 10

      const highlight = hasRegistro
        ? `Bono hasta S/${maxBonus ?? '?'}`
        : promos[0]?.title ?? null

      return {
        site_slug: slug,
        site_name: name,
        score: Math.round(score),
        max_bonus: maxBonus || null,
        promo_count: promos.length,
        highlight,
      }
    })
    .sort((a, b) => b.score - a.score)
}
