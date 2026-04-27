import type { Promotion, SeoSnapshot, AlertLevel } from '@competencia/shared'
import { db } from '../db/client.js'
import { logger } from '../utils/logger.js'

// ── Promotion diff ─────────────────────────────────────────────────────────

export interface PromoDiff {
  siteId: string
  siteName: string
  siteSlug: string
  promoType: string
  changeType: 'new' | 'modified' | 'removed'
  before: Partial<Promotion> | null
  after: Partial<Promotion> | null
  alertLevel: AlertLevel
  summary: string
}

function classifyPromoAlertLevel(
  changeType: 'new' | 'modified' | 'removed',
  before: Partial<Promotion> | null,
  after: Partial<Promotion> | null,
  isOwnBrand: boolean
): AlertLevel {
  // Bono de registro siempre es HIGH
  const isRegistro = (before?.promo_type ?? after?.promo_type) === 'registro'
  if (isRegistro) return 'high'

  // Nuevo bono con monto alto
  if (changeType === 'new' && (after?.max_bonus ?? 0) >= 200) return 'high'

  // Cambio significativo en monto
  if (changeType === 'modified' && before?.max_bonus && after?.max_bonus) {
    const diff = Math.abs(after.max_bonus - before.max_bonus)
    const pct = diff / before.max_bonus
    if (pct >= 0.25) return 'high'
    if (pct >= 0.1) return 'medium'
  }

  if (changeType === 'new') return 'medium'
  if (changeType === 'removed') return 'medium'
  return 'low'
}

export async function diffPromotions(
  siteId: string,
  siteName: string,
  siteSlug: string,
  isOwnBrand: boolean,
  todayPromos: Promotion[],
  yesterday: string,
  today: string
): Promise<PromoDiff[]> {
  const { data: prevPromos } = await db
    .from('promotions')
    .select('*')
    .eq('site_id', siteId)
    .eq('snapshot_date', yesterday)
    .eq('is_false_positive', false)

  const prev = (prevPromos ?? []) as Promotion[]
  const diffs: PromoDiff[] = []

  // Agrupar por tipo para comparar
  const prevByType = new Map<string, Promotion>()
  const todayByType = new Map<string, Promotion>()

  for (const p of prev) prevByType.set(p.promo_type, p)
  for (const p of todayPromos) todayByType.set(p.promo_type, p)

  // Nuevas o modificadas
  for (const [type, today] of todayByType) {
    const before = prevByType.get(type) ?? null
    if (!before) {
      const level = classifyPromoAlertLevel('new', null, today, isOwnBrand)
      diffs.push({
        siteId, siteName, siteSlug,
        promoType: type,
        changeType: 'new',
        before: null,
        after: today,
        alertLevel: level,
        summary: `Nueva promo "${today.title}" (${today.promo_type})${today.max_bonus ? ` hasta S/${today.max_bonus}` : ''}`,
      })
    } else {
      const changed =
        before.max_bonus !== today.max_bonus ||
        before.bonus_pct !== today.bonus_pct ||
        before.min_deposit !== today.min_deposit ||
        before.rollover !== today.rollover ||
        before.title !== today.title

      if (changed) {
        const level = classifyPromoAlertLevel('modified', before, today, isOwnBrand)
        diffs.push({
          siteId, siteName, siteSlug,
          promoType: type,
          changeType: 'modified',
          before,
          after: today,
          alertLevel: level,
          summary: buildModifiedSummary(before, today),
        })
      }
    }
  }

  // Removidas
  for (const [type, before] of prevByType) {
    if (!todayByType.has(type)) {
      diffs.push({
        siteId, siteName, siteSlug,
        promoType: type,
        changeType: 'removed',
        before,
        after: null,
        alertLevel: 'medium',
        summary: `Promo removida: "${before.title}" (${before.promo_type})`,
      })
    }
  }

  return diffs
}

function buildModifiedSummary(before: Promotion, after: Promotion): string {
  const changes: string[] = []
  if (before.max_bonus !== after.max_bonus) {
    changes.push(`bono máx: S/${before.max_bonus} → S/${after.max_bonus}`)
  }
  if (before.bonus_pct !== after.bonus_pct) {
    changes.push(`porcentaje: ${before.bonus_pct}% → ${after.bonus_pct}%`)
  }
  if (before.rollover !== after.rollover) {
    changes.push(`rollover: ${before.rollover} → ${after.rollover}`)
  }
  if (before.title !== after.title) {
    changes.push(`título: "${before.title}" → "${after.title}"`)
  }
  return `Cambio en ${after.promo_type}: ${changes.join(', ')}`
}

// ── SEO diff ───────────────────────────────────────────────────────────────

export interface SeoDiff {
  siteId: string
  siteName: string
  field: string
  before: string | null
  after: string | null
  alertLevel: AlertLevel
}

const SEO_HIGH_FIELDS = new Set(['title', 'h1'])
const SEO_MED_FIELDS = new Set(['meta_description', 'canonical', 'robots_meta', 'is_indexable'])

export async function diffSeo(
  siteId: string,
  siteName: string,
  todaySeo: SeoSnapshot,
  yesterday: string
): Promise<SeoDiff[]> {
  const { data: prevData } = await db
    .from('seo_snapshots')
    .select('*')
    .eq('site_id', siteId)
    .eq('snapshot_date', yesterday)
    .maybeSingle()

  if (!prevData) return []
  const prev = prevData as SeoSnapshot
  const diffs: SeoDiff[] = []

  const compareFields: Array<keyof SeoSnapshot> = [
    'title', 'meta_description', 'h1', 'canonical', 'robots_meta', 'is_indexable',
  ]

  for (const field of compareFields) {
    const before = String(prev[field] ?? '')
    const after = String(todaySeo[field] ?? '')
    if (before !== after) {
      const level: AlertLevel = SEO_HIGH_FIELDS.has(field)
        ? 'high'
        : SEO_MED_FIELDS.has(field)
          ? 'medium'
          : 'low'
      diffs.push({ siteId, siteName, field, before, after, alertLevel: level })
    }
  }

  return diffs
}

// ── PageSpeed diff ─────────────────────────────────────────────────────────

export interface PageSpeedDiff {
  siteId: string
  siteName: string
  device: string
  field: string
  before: number | null
  after: number | null
  delta: number
  alertLevel: AlertLevel
}

export async function diffPageSpeed(
  siteId: string,
  siteName: string,
  device: string,
  todayPerf: number | null,
  yesterday: string
): Promise<PageSpeedDiff[]> {
  const { data } = await db
    .from('pagespeed_snapshots')
    .select('performance')
    .eq('site_id', siteId)
    .eq('snapshot_date', yesterday)
    .eq('device', device)
    .maybeSingle()

  if (!data || todayPerf === null) return []
  const before = (data as { performance: number }).performance
  const delta = todayPerf - before

  if (Math.abs(delta) < 5) return []

  const alertLevel: AlertLevel = Math.abs(delta) >= 10 ? 'high' : 'medium'

  return [{
    siteId, siteName, device,
    field: 'performance',
    before,
    after: todayPerf,
    delta,
    alertLevel,
  }]
}
