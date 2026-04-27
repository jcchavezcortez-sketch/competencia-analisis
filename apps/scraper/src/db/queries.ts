import { db } from './client.js'
import type { Site, DailySnapshot, Promotion, SeoSnapshot, PageSpeedSnapshot } from '@competencia/shared'

// ── Sites ──────────────────────────────────────────────────────────────────

export async function getActiveSites(): Promise<Site[]> {
  const { data, error } = await db.from('sites').select('*').eq('is_active', true).order('is_own_brand', { ascending: false })
  if (error) throw new Error(`getActiveSites: ${error.message}`)
  return data as Site[]
}

// ── Snapshots ──────────────────────────────────────────────────────────────

export async function upsertSnapshot(
  siteId: string,
  date: string
): Promise<DailySnapshot> {
  const { data, error } = await db
    .from('daily_snapshots')
    .upsert({ site_id: siteId, snapshot_date: date, scrape_status: 'pending' }, { onConflict: 'site_id,snapshot_date' })
    .select()
    .single()
  if (error) throw new Error(`upsertSnapshot: ${error.message}`)
  return data as DailySnapshot
}

export async function updateSnapshotStatus(
  id: string,
  status: string,
  durationSeconds?: number,
  errorLog?: string
): Promise<void> {
  const { error } = await db
    .from('daily_snapshots')
    .update({
      scrape_status: status,
      scraped_at: new Date().toISOString(),
      scrape_duration_seconds: durationSeconds ?? null,
      error_log: errorLog ?? null,
    })
    .eq('id', id)
  if (error) throw new Error(`updateSnapshotStatus: ${error.message}`)
}

// ── Promotions ─────────────────────────────────────────────────────────────

export async function savePromotions(promos: Omit<Promotion, 'id' | 'created_at'>[]): Promise<void> {
  if (promos.length === 0) return
  // Borrar promos del día para ese sitio y reemplazar
  const siteId = promos[0].site_id
  const date = promos[0].snapshot_date
  await db.from('promotions').delete().eq('site_id', siteId).eq('snapshot_date', date).eq('manually_edited', false)
  const { error } = await db.from('promotions').insert(promos)
  if (error) throw new Error(`savePromotions: ${error.message}`)
}

export async function getPromotionsByDate(siteId: string, date: string): Promise<Promotion[]> {
  const { data, error } = await db
    .from('promotions')
    .select('*')
    .eq('site_id', siteId)
    .eq('snapshot_date', date)
    .eq('is_false_positive', false)
  if (error) throw new Error(`getPromotionsByDate: ${error.message}`)
  return (data ?? []) as Promotion[]
}

// ── SEO ────────────────────────────────────────────────────────────────────

export async function saveSeoSnapshot(seo: Omit<SeoSnapshot, 'id' | 'created_at'>): Promise<void> {
  await db.from('seo_snapshots').delete().eq('site_id', seo.site_id).eq('snapshot_date', seo.snapshot_date)
  const { error } = await db.from('seo_snapshots').insert(seo)
  if (error) throw new Error(`saveSeoSnapshot: ${error.message}`)
}

export async function getSeoByDate(siteId: string, date: string): Promise<SeoSnapshot | null> {
  const { data, error } = await db
    .from('seo_snapshots')
    .select('*')
    .eq('site_id', siteId)
    .eq('snapshot_date', date)
    .maybeSingle()
  if (error) throw new Error(`getSeoByDate: ${error.message}`)
  return data as SeoSnapshot | null
}

// ── PageSpeed ──────────────────────────────────────────────────────────────

export async function savePageSpeed(psi: Omit<PageSpeedSnapshot, 'id' | 'created_at'>): Promise<void> {
  await db.from('pagespeed_snapshots').delete()
    .eq('site_id', psi.site_id)
    .eq('snapshot_date', psi.snapshot_date)
    .eq('device', psi.device)
  const { error } = await db.from('pagespeed_snapshots').insert(psi)
  if (error) throw new Error(`savePageSpeed: ${error.message}`)
}

// ── Alerts ─────────────────────────────────────────────────────────────────

export async function saveAlert(alert: {
  site_id: string
  source_type: string
  alert_level: string
  title: string
  description?: string
  before_data?: unknown
  after_data?: unknown
  url?: string
  conclusion?: string
}): Promise<string> {
  const { data, error } = await db.from('alerts').insert(alert).select('id').single()
  if (error) throw new Error(`saveAlert: ${error.message}`)
  return (data as { id: string }).id
}

export async function markAlertEmailSent(id: string): Promise<void> {
  const { error } = await db.from('alerts').update({ email_sent: true, email_sent_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(`markAlertEmailSent: ${error.message}`)
}

// ── Daily report ───────────────────────────────────────────────────────────

export async function saveDailyReport(report: {
  report_date: string
  executive_summary?: string
  promo_table?: unknown
  aggressiveness_ranking?: unknown
  pagespeed_comparison?: unknown
  seo_changes_summary?: unknown
  new_promos?: unknown
  removed_promos?: unknown
  conclusions?: string
  recommendations?: string
}): Promise<void> {
  const { error } = await db.from('daily_reports').upsert(report, { onConflict: 'report_date' })
  if (error) throw new Error(`saveDailyReport: ${error.message}`)
}

// ── Scrape log ─────────────────────────────────────────────────────────────

export async function createScrapeLog(date: string): Promise<string> {
  const { data, error } = await db
    .from('scrape_logs')
    .insert({ run_date: date, status: 'running', steps_log: [] })
    .select('id')
    .single()
  if (error) throw new Error(`createScrapeLog: ${error.message}`)
  return (data as { id: string }).id
}

export async function updateScrapeLog(
  id: string,
  fields: {
    status?: string
    sites_ok?: number
    sites_failed?: number
    total_promos?: number
    total_changes?: number
    alerts_sent?: number
    steps_log?: unknown[]
    error_details?: string
    finished_at?: string
  }
): Promise<void> {
  const { error } = await db.from('scrape_logs').update(fields).eq('id', id)
  if (error) throw new Error(`updateScrapeLog: ${error.message}`)
}
