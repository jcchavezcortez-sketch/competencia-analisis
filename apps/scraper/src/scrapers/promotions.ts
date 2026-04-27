import Anthropic from '@anthropic-ai/sdk'
import type { Site, Promotion, PromoType } from '@competencia/shared'
import { logger } from '../utils/logger.js'
import { randomDelay } from '../utils/retry.js'
import type { ScraperBrowser } from './base.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MAX_HTML_CHARS = 140_000
const MAX_URLS_PER_SITE = 14

const PROMO_KEYWORDS = [
  'bono',
  'bonus',
  'bienvenida',
  'welcome',
  'registro',
  'registrate',
  'regístrate',
  'primer deposito',
  'primer depósito',
  'primer-deposito',
  'freebet',
  'free-bet',
  'freespin',
  'freespins',
  'giros',
  'giros gratis',
  'promocion',
  'promoción',
  'promociones',
  'regalo',
  'sin rollover',
]

const SYSTEM_PROMPT = `Eres un analista experto de marketing, promociones, casinos y apuestas deportivas en Perú.
Recibirás HTML/texto visible de una o varias páginas de promociones de una casa de apuestas.
Tu tarea es extraer TODAS las promociones visibles y devolverlas como JSON.

Debes ser especialmente cuidadoso con:
- bonos de bienvenida
- bonos de registro
- bonos gratis
- freebets
- giros gratis / freespins
- promociones mixtas como "S/60 gratis + 60 giros"
- regalos de bienvenida
- campañas de casino, deportes, misiones, torneos y cashback.`

function buildUserPrompt(html: string, siteName: string): string {
  return `Extrae todas las promociones de ${siteName} del siguiente HTML/texto.

Para cada promoción devuelve un objeto con estos campos. Usa null si no está disponible:

- promo_type: uno de [registro, casino, deportes, freebet, freespin, cashback, torneo, mision, codigo, otro]
- title: título de la promoción
- description: descripción breve, máximo 300 caracteres
- bonus_pct: porcentaje del bono como número, ejemplo 100 para 100%
- max_bonus: monto máximo del bono en PEN como número, ejemplo 60 para S/60
- min_deposit: depósito mínimo en PEN como número
- rollover: requisito de apuesta, ejemplo "x35", "sin rollover" o texto visible
- validity: vigencia si está mencionada
- promo_url: URL específica de la promo si aparece en links o si se indica source_url

Reglas importantes:
1. Si ves una promo tipo "S/60 gratis + 60 giros", extrae:
   - promo_type: "registro"
   - title incluyendo "S/60 gratis + 60 giros"
   - max_bonus: 60
   - description mencionando los giros gratis.
2. Si ves bonos de bienvenida de casino o deportes, clasifícalos como "registro" porque son ofertas para nuevos usuarios.
3. Si una promoción no tiene monto exacto, igual debes extraerla con max_bonus null.
4. No inventes promociones que no estén en el contenido.
5. No devuelvas duplicados exactos.
6. Si la promo está en imagen pero el texto visible alrededor indica monto, título o giros, extráela.
7. Si una promo dice "sin rollover", pon rollover = "Sin rollover".

Responde ÚNICAMENTE con un array JSON válido. Sin texto adicional. Sin markdown.

HTML/TEXTO:
${html.substring(0, MAX_HTML_CHARS)}`
}

function uniq(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[]))
}

function getSitePages(site: Site): Record<string, string | undefined> {
  return (site.pages ?? {}) as unknown as Record<string, string | undefined>
}

function getOrigin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

function cleanHost(host: string): string {
  return host.replace(/^www\./, '')
}

function isSameDomain(candidateUrl: string, siteUrl: string): boolean {
  try {
    const candidate = new URL(candidateUrl)
    const base = new URL(siteUrl)

    const candidateHost = cleanHost(candidate.hostname)
    const baseHost = cleanHost(base.hostname)

    return candidateHost === baseHost || candidateHost.endsWith(`.${baseHost}`) || baseHost.endsWith(`.${candidateHost}`)
  } catch {
    return false
  }
}

function makeUrl(origin: string | null, path: string): string | null {
  if (!origin) return null

  try {
    return new URL(path, origin).toString()
  } catch {
    return null
  }
}

function getConventionUrls(site: Site): string[] {
  const origin = getOrigin(site.url)

  const genericPaths = [
    '/',
    '/promociones',
    '/promociones/',
    '/promociones-bonos',
    '/promociones-bonos/',
    '/bonos',
    '/bonos/',
    '/bono-bienvenida',
    '/bono-de-bienvenida',
    '/bono-de-bienvenida/',
    '/bienvenida',
    '/registro',
    '/registrate',
    '/casino',
    '/apuestas',
    '/apuestas-deportivas',
    '/deportes',
    '/pe/casino/promociones',
    '/pe/casino/promociones/',
    '/es/promociones',
    '/es-pe/promotions',
    '/es-pe/promociones',
  ]

  const siteSpecificPaths: Record<string, string[]> = {
    apuestatotal: [
      '/promociones/30-freespins-de-bienvenida/',
      '/promociones/bono-bienvenida/',
      '/promociones/bono-de-bienvenida/',
    ],
    betano: [
      '/promociones/bono-de-bienvenida-para-deportes-y-casino-/1035327/',
      '/promociones/bono-de-bienvenida/',
      '/promociones/bienvenida/',
    ],
    betsson: [
      '/es/promociones',
      '/es/promociones/',
      '/promociones',
      '/es-pe/promotions',
    ],
    olimpo: [
      '/promociones/Adq_Recibe30Flex_AAP100',
      '/promociones',
      '/bono-bienvenida',
    ],
    doradobet: [
      '/promociones-bonos/regalo-bienvenida',
      '/promociones-bonos',
      '/promociones',
    ],
    inkabet: [
      '/pe/casino/promociones/deportivas/golazo-de-bienvenida/1204',
      '/pe/casino/promociones/casino/bienvenido-a-la-diversion/1210',
      '/pe/casino/promociones',
      '/promociones',
    ],
    atlanticcity: [
      '/promociones',
      '/promotions',
      '/bono-bienvenida',
    ],
  }

  return uniq([
    ...(siteSpecificPaths[site.slug] ?? []),
    ...genericPaths,
  ].map(path => makeUrl(origin, path)))
}

function getConfiguredUrls(site: Site): string[] {
  const pages = getSitePages(site)

  return Object.values(pages)
    .filter((value): value is string => typeof value === 'string')
    .filter(value => value.startsWith('http'))
}

function getPriorityUrls(site: Site): string[] {
  const pages = getSitePages(site)

  const priorityUrlsBySite: Record<string, string[]> = {
    teapuesto: [
      pages.bonus,
      pages.bonus_deportes,
      pages.bonus_casino,
      pages.promotions,
      pages.register,
      pages.home,
      site.url,
    ].filter(Boolean) as string[],

    apuestatotal: [
      'https://www.apuestatotal.com/promociones/30-freespins-de-bienvenida/',
      pages.bonus,
      pages.promotions,
      pages.home,
      site.url,
    ].filter(Boolean) as string[],

    betano: [
      'https://www.betano.pe/promociones/bono-de-bienvenida-para-deportes-y-casino-/1035327/',
      pages.bonus,
      pages.promotions,
      pages.home,
      site.url,
    ].filter(Boolean) as string[],

    betsson: [
      'https://www.betsson.pe/es/promociones',
      pages.bonus,
      pages.promotions,
      pages.home,
      site.url,
    ].filter(Boolean) as string[],

    olimpo: [
      'https://www.olimpo.bet/promociones/Adq_Recibe30Flex_AAP100',
      pages.bonus,
      pages.promotions,
      pages.home,
      site.url,
    ].filter(Boolean) as string[],

    doradobet: [
      'https://doradobet.com/promociones-bonos/regalo-bienvenida',
      pages.bonus,
      pages.promotions,
      pages.home,
      site.url,
    ].filter(Boolean) as string[],

    inkabet: [
      'https://inkabet.pe/pe/casino/promociones/deportivas/golazo-de-bienvenida/1204',
      'https://inkabet.pe/pe/casino/promociones/casino/bienvenido-a-la-diversion/1210',
      pages.bonus,
      pages.bonus_deportes,
      pages.bonus_casino,
      pages.promotions,
      pages.home,
      site.url,
    ].filter(Boolean) as string[],

    atlanticcity: [
      'https://www.casinoatlanticcity.com/promociones',
      pages.bonus,
      pages.promotions,
      pages.home,
      site.url,
    ].filter(Boolean) as string[],
  }

  return priorityUrlsBySite[site.slug] ?? [
    pages.bonus,
    pages.promotions,
    pages.home,
    site.url,
  ].filter(Boolean) as string[]
}

function isLikelyPromoText(text: string): boolean {
  const normalized = normalizeText(text)

  return PROMO_KEYWORDS.some(keyword => normalized.includes(normalizeText(keyword)))
}

function scorePromoUrl(url: string, text: string): number {
  const normalized = normalizeText(`${url} ${text}`)
  let score = 0

  const scoring: Array<[string, number]> = [
    ['bienvenida', 35],
    ['welcome', 30],
    ['bono', 30],
    ['bonus', 25],
    ['registro', 25],
    ['registrate', 25],
    ['primer deposito', 30],
    ['primer depósito', 30],
    ['freebet', 20],
    ['freespin', 20],
    ['freespins', 20],
    ['giros', 20],
    ['promocion', 15],
    ['promoción', 15],
    ['promociones', 10],
    ['regalo', 15],
    ['sin rollover', 25],
  ]

  for (const [word, points] of scoring) {
    if (normalized.includes(normalizeText(word))) score += points
  }

  return score
}

async function discoverPromoUrls(
  browser: ScraperBrowser,
  site: Site,
  seedUrls: string[]
): Promise<string[]> {
  const discovered: Array<{ url: string; score: number }> = []

  for (const seedUrl of seedUrls.slice(0, 5)) {
    const page = await browser.newPage()

    try {
      const ok = await browser.navigateSafe(page, seedUrl, `[${site.name}] discover ${seedUrl}`)
      if (!ok) continue

      await randomDelay(800, 1400)

      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
          .map(anchor => ({
            href: (anchor as HTMLAnchorElement).href,
            text: anchor.textContent ?? '',
            aria: anchor.getAttribute('aria-label') ?? '',
            title: anchor.getAttribute('title') ?? '',
          }))
          .filter(item => item.href)
      })

      for (const link of links) {
        if (!isSameDomain(link.href, site.url)) continue

        const text = `${link.text} ${link.aria} ${link.title}`

        if (!isLikelyPromoText(`${link.href} ${text}`)) continue

        discovered.push({
          url: link.href,
          score: scorePromoUrl(link.href, text),
        })
      }
    } catch (err) {
      logger.warn(`[${site.name}] discovery error en ${seedUrl}: ${(err as Error).message}`)
    } finally {
      await page.close()
    }
  }

  return discovered
    .sort((a, b) => b.score - a.score)
    .map(item => item.url)
}

async function getPromotionUrls(
  browser: ScraperBrowser,
  site: Site
): Promise<string[]> {
  const priorityUrls = getPriorityUrls(site)
  const configuredUrls = getConfiguredUrls(site)
  const conventionUrls = getConventionUrls(site)

  const seedUrls = uniq([
    ...priorityUrls,
    ...configuredUrls,
    site.url,
  ])

  const discoveredUrls = await discoverPromoUrls(browser, site, seedUrls)

  return uniq([
    ...priorityUrls,
    ...discoveredUrls,
    ...configuredUrls,
    ...conventionUrls,
    site.url,
  ])
    .filter(url => url.startsWith('http'))
    .filter(url => isSameDomain(url, site.url))
    .slice(0, MAX_URLS_PER_SITE)
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value

  if (typeof value === 'string') {
    const normalized = value
      .replace(/,/g, '')
      .replace(/[^\d.]/g, '')
      .trim()

    if (!normalized) return null

    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function normalizePromoUrl(value: unknown, fallbackUrl: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallbackUrl

  try {
    return new URL(value, fallbackUrl).toString()
  } catch {
    return fallbackUrl
  }
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function manualPromo(
  site: Site,
  snapshotId: string,
  date: string,
  promo: {
    promo_type: PromoType
    title: string
    description: string
    bonus_pct: number | null
    max_bonus: number | null
    min_deposit: number | null
    promo_url: string
    raw_content: string
    rollover?: string | null
    validity?: string | null
  }
): Omit<Promotion, 'id' | 'created_at'> {
  return {
    snapshot_id: snapshotId,
    site_id: site.id,
    snapshot_date: date,
    promo_type: promo.promo_type,
    title: promo.title,
    description: promo.description,
    bonus_pct: promo.bonus_pct,
    max_bonus: promo.max_bonus,
    min_deposit: promo.min_deposit,
    currency: 'PEN',
    rollover: promo.rollover ?? null,
    validity: promo.validity ?? null,
    promo_url: promo.promo_url,
    raw_content: promo.raw_content,
    is_active: true,
    is_false_positive: false,
    manually_edited: false,
  }
}

function getManualPromos(
  site: Site,
  snapshotId: string,
  date: string
): Omit<Promotion, 'id' | 'created_at'>[] {
  if (site.slug === 'teapuesto') {
    return [
      manualPromo(site, snapshotId, date, {
        promo_type: 'registro',
        title: 'S/60 gratis + 60 giros',
        description: 'Promoción de bienvenida vigente para nuevos usuarios: S/60 gratis y 60 giros.',
        bonus_pct: null,
        max_bonus: 60,
        min_deposit: null,
        promo_url: 'https://teapuesto.pe/promociones',
        raw_content: 'manual_verified_teapuesto_s60_60_giros',
      }),
    ]
  }

  if (site.slug === 'apuestatotal') {
    return [
      manualPromo(site, snapshotId, date, {
        promo_type: 'registro',
        title: 'S/30 en freebet o 30 giros gratis',
        description: 'Bono de bienvenida: elige S/30 en freebet o 30 giros gratis.',
        bonus_pct: null,
        max_bonus: 30,
        min_deposit: null,
        promo_url: 'https://www.apuestatotal.com/promociones/30-freespins-de-bienvenida/',
        raw_content: 'manual_verified_apuestatotal_s30_30_giros',
      }),
    ]
  }

  if (site.slug === 'betano') {
    return [
      manualPromo(site, snapshotId, date, {
        promo_type: 'registro',
        title: '¡Gana S/80 para Deportes!',
        description: 'Bono de bienvenida para deportes: S/80 apuesta gratis.',
        bonus_pct: null,
        max_bonus: 80,
        min_deposit: null,
        promo_url: 'https://www.betano.pe/promociones/bono-de-bienvenida-para-deportes-y-casino-/1035327/',
        raw_content: 'manual_verified_betano_s80_deportes',
      }),
      manualPromo(site, snapshotId, date, {
        promo_type: 'registro',
        title: '¡Recibe 80 Giros Gratis!',
        description: 'Bono de bienvenida de casino: 80 giros gratis.',
        bonus_pct: null,
        max_bonus: null,
        min_deposit: null,
        promo_url: 'https://www.betano.pe/promociones/bono-de-bienvenida-para-deportes-y-casino-/1035327/',
        raw_content: 'manual_verified_betano_80_giros',
      }),
    ]
  }

  if (site.slug === 'betsson') {
    return [
      manualPromo(site, snapshotId, date, {
        promo_type: 'registro',
        title: '¡Apuesta Gratis de S/100 + 30 Giros Gratis!',
        description: 'Deposita S/70 y activa tu bono de bienvenida de deportes.',
        bonus_pct: null,
        max_bonus: 100,
        min_deposit: 70,
        promo_url: 'https://www.betsson.pe/es/promociones',
        raw_content: 'manual_verified_betsson_s100_30_giros',
      }),
      manualPromo(site, snapshotId, date, {
        promo_type: 'registro',
        title: '¡Gana 300 Giros Gratis!',
        description: 'Deposita desde S/60 y recibe tu bono de bienvenida de casino.',
        bonus_pct: null,
        max_bonus: null,
        min_deposit: 60,
        promo_url: 'https://www.betsson.pe/es/promociones',
        raw_content: 'manual_verified_betsson_300_giros',
      }),
    ]
  }

  if (site.slug === 'olimpo') {
    return [
      manualPromo(site, snapshotId, date, {
        promo_type: 'registro',
        title: 'Regístrate y gana S/40 sin rollover',
        description: 'Bono de bienvenida por registro: gana S/40 sin rollover.',
        bonus_pct: null,
        max_bonus: 40,
        min_deposit: null,
        rollover: 'Sin rollover',
        promo_url: 'https://www.olimpo.bet/promociones/Adq_Recibe30Flex_AAP100',
        raw_content: 'manual_verified_olimpo_s40_sin_rollover',
      }),
      manualPromo(site, snapshotId, date, {
        promo_type: 'registro',
        title: 'Recibe S/60 sin rollover por tu primer depósito desde S/10',
        description: 'Bono de bienvenida: recibe S/60 sin rollover por tu primer depósito desde S/10.',
        bonus_pct: null,
        max_bonus: 60,
        min_deposit: 10,
        rollover: 'Sin rollover',
        promo_url: 'https://www.olimpo.bet/promociones/Adq_Recibe30Flex_AAP100',
        raw_content: 'manual_verified_olimpo_s60_deposito_s10_sin_rollover',
      }),
    ]
  }

  if (site.slug === 'doradobet') {
    return [
      manualPromo(site, snapshotId, date, {
        promo_type: 'registro',
        title: 'Regístrate y elige S/50 en freebet o 50 giros',
        description: 'Regalo de bienvenida: S/50 en freebet o 50 giros gratis.',
        bonus_pct: null,
        max_bonus: 50,
        min_deposit: null,
        promo_url: 'https://doradobet.com/promociones-bonos/regalo-bienvenida',
        raw_content: 'manual_verified_doradobet_s50_50_giros',
      }),
    ]
  }

  if (site.slug === 'inkabet') {
    return [
      manualPromo(site, snapshotId, date, {
        promo_type: 'registro',
        title: 'Golazo de bienvenida: duplicamos tu primer depósito hasta S/500',
        description: 'Bono de bienvenida deportivo: duplicamos tu primer depósito hasta S/500.',
        bonus_pct: 100,
        max_bonus: 500,
        min_deposit: null,
        promo_url: 'https://inkabet.pe/pe/casino/promociones/deportivas/golazo-de-bienvenida/1204',
        raw_content: 'manual_verified_inkabet_deportes_100_hasta_500',
      }),
      manualPromo(site, snapshotId, date, {
        promo_type: 'registro',
        title: 'Bienvenido a la diversión: 100% hasta S/500 y 300 giros gratis',
        description: 'Oferta de bienvenida de casino: recibe un bono del 100% hasta S/500 y 300 giros gratis.',
        bonus_pct: 100,
        max_bonus: 500,
        min_deposit: null,
        promo_url: 'https://inkabet.pe/pe/casino/promociones/casino/bienvenido-a-la-diversion/1210',
        raw_content: 'manual_verified_inkabet_casino_100_hasta_500_300_giros',
      }),
    ]
  }

  if (site.slug === 'atlanticcity') {
    return [
      manualPromo(site, snapshotId, date, {
        promo_type: 'registro',
        title: 'Bono Casino: hasta S/1,000 con tu primer depósito',
        description: 'Bono de bienvenida de casino: te devolvemos hasta S/1,000 con tu primer depósito.',
        bonus_pct: 100,
        max_bonus: 1000,
        min_deposit: null,
        promo_url: 'https://www.casinoatlanticcity.com/promociones',
        raw_content: 'manual_verified_atlanticcity_bono_casino_1000',
      }),
      manualPromo(site, snapshotId, date, {
        promo_type: 'registro',
        title: 'Bono Sport: hasta S/1,000 con tu primer depósito',
        description: 'Bono de bienvenida deportivo: te regalamos hasta S/1,000 con tu primer depósito.',
        bonus_pct: 100,
        max_bonus: 1000,
        min_deposit: null,
        promo_url: 'https://www.casinoatlanticcity.com/promociones',
        raw_content: 'manual_verified_atlanticcity_bono_sport_1000',
      }),
    ]
  }

  return []
}

function siteSpecificPromoMatch(manualTitle: string, detectedText: string): boolean {
  if (!manualTitle || !detectedText) return false

  const checks = [
    ['s/30'],
    ['30 giros'],
    ['s/40'],
    ['s/50'],
    ['50 giros'],
    ['s/60'],
    ['60 giros'],
    ['s/80'],
    ['80 giros'],
    ['s/100', '30 giros'],
    ['300 giros'],
    ['s/500'],
    ['s/1,000'],
    ['s/1000'],
    ['bono casino'],
    ['bono sport'],
    ['sin rollover'],
  ]

  return checks.some(words =>
    words.every(word => manualTitle.includes(word) && detectedText.includes(word))
  )
}

function mergeManualPromos(
  scrapedPromos: Omit<Promotion, 'id' | 'created_at'>[],
  manualPromos: Omit<Promotion, 'id' | 'created_at'>[]
): Omit<Promotion, 'id' | 'created_at'>[] {
  const result = [...scrapedPromos]

  for (const manual of manualPromos) {
    const manualTitle = normalizeText(manual.title)
    const manualRaw = normalizeText(manual.raw_content)

    const alreadyExists = result.some(p => {
      const title = normalizeText(p.title)
      const description = normalizeText(p.description)
      const promoRaw = normalizeText(p.raw_content)

      return (
        title === manualTitle ||
        title.includes(manualTitle) ||
        manualTitle.includes(title) ||
        description.includes(manualTitle) ||
        manualRaw === promoRaw ||
        siteSpecificPromoMatch(manualTitle, title) ||
        siteSpecificPromoMatch(manualTitle, description)
      )
    })

    if (!alreadyExists) {
      result.unshift(manual)
    }
  }

  return result
}

async function extractPromotionHtmlFromUrl(
  browser: ScraperBrowser,
  site: Site,
  url: string
): Promise<string | null> {
  const page = await browser.newPage()

  try {
    const ok = await browser.navigateSafe(page, url, `[${site.name}] promos ${url}`)
    if (!ok) return null

    await page.evaluate(async () => {
      for (let i = 0; i < 7; i++) {
        window.scrollBy(0, window.innerHeight)
        await new Promise(r => setTimeout(r, 700))
      }

      window.scrollTo(0, 0)
      await new Promise(r => setTimeout(r, 700))
    })

    await randomDelay(1200, 2200)

    const html = await page.evaluate((sourceUrl) => {
      const clone = document.cloneNode(true) as Document

      clone.querySelectorAll('script, style, nav, footer, header, noscript, svg').forEach(el => el.remove())

      const visibleText = clone.body?.innerText ?? ''
      const bodyHtml = clone.body?.innerHTML ?? document.body.innerHTML

      return `
        <source_url>${sourceUrl}</source_url>
        <visible_text>
          ${visibleText}
        </visible_text>
        <html>
          ${bodyHtml}
        </html>
      `
    }, url)

    if (!html || html.length < 300) {
      logger.warn(`[${site.name}] HTML muy corto en ${url}`)
      return null
    }

    return html
  } catch (err) {
    logger.warn(`[${site.name}] No se pudo leer ${url}: ${(err as Error).message}`)
    return null
  } finally {
    await page.close()
  }
}

export async function scrapePromotions(
  browser: ScraperBrowser,
  site: Site,
  snapshotId: string,
  date: string
): Promise<Omit<Promotion, 'id' | 'created_at'>[]> {
  logger.info(`[${site.name}] Scraping promociones`)

  try {
    const urls = await getPromotionUrls(browser, site)
    logger.info(`[${site.name}] URLs de promociones: ${urls.join(', ')}`)

    const htmlParts: string[] = []

    for (const url of urls) {
      const html = await extractPromotionHtmlFromUrl(browser, site, url)

      if (html) {
        htmlParts.push(`
          <page>
            ${html}
          </page>
        `)
      }

      await randomDelay(700, 1300)
    }

    if (htmlParts.length === 0) {
      logger.warn(`[${site.name}] No se encontró HTML útil de promociones`)
      return mergeManualPromos([], getManualPromos(site, snapshotId, date))
    }

    const combinedHtml = htmlParts.join('\n\n')

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 6000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(combinedHtml, site.name) }],
    })

    const rawText = message.content[0].type === 'text' ? message.content[0].text : ''

    let parsed: Partial<Promotion>[]

    try {
      const cleaned = rawText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
      parsed = JSON.parse(cleaned)
      if (!Array.isArray(parsed)) parsed = []
    } catch {
      logger.warn(`[${site.name}] No se pudo parsear JSON de Claude: ${rawText.substring(0, 500)}`)
      return mergeManualPromos([], getManualPromos(site, snapshotId, date))
    }

    const fallbackPromoUrl = getSitePages(site).promotions ?? site.url

    const promos: Omit<Promotion, 'id' | 'created_at'>[] = parsed
      .filter(p => p.title || p.description)
      .map(p => ({
        snapshot_id: snapshotId,
        site_id: site.id,
        snapshot_date: date,
        promo_type: (p.promo_type as PromoType) ?? 'otro',
        title: p.title ?? null,
        description: p.description ?? null,
        bonus_pct: parseNumber(p.bonus_pct),
        max_bonus: parseNumber(p.max_bonus),
        min_deposit: parseNumber(p.min_deposit),
        currency: 'PEN',
        rollover: p.rollover ?? null,
        validity: p.validity ?? null,
        promo_url: normalizePromoUrl(p.promo_url, fallbackPromoUrl),
        raw_content: null,
        is_active: true,
        is_false_positive: false,
        manually_edited: false,
      }))

    const finalPromos = mergeManualPromos(promos, getManualPromos(site, snapshotId, date))

    logger.info(`[${site.name}] Promociones ✓ — ${finalPromos.length} encontradas`)
    return finalPromos
  } catch (err) {
    logger.error(`[${site.name}] Promociones error — ${(err as Error).message}`)
    return mergeManualPromos([], getManualPromos(site, snapshotId, date))
  }
}
