// ============================================================
// Tipos compartidos entre scraper y web
// ============================================================

export type AlertLevel = 'low' | 'medium' | 'high'
export type ScrapeStatus = 'pending' | 'success' | 'partial' | 'failed'
export type Device = 'mobile' | 'desktop'
export type PromoType =
  | 'registro'
  | 'casino'
  | 'deportes'
  | 'freebet'
  | 'freespin'
  | 'cashback'
  | 'torneo'
  | 'mision'
  | 'codigo'
  | 'otro'

export type PageType =
  | 'home'
  | 'promotions'
  | 'casino'
  | 'sports'
  | 'register'
  | 'bonus'
  | 'banner'

export interface SitePages {
  home: string
  promotions: string
  casino: string
  sports: string
  register: string
  bonus: string
}

export interface Site {
  id: string
  name: string
  slug: string
  url: string
  logo_url: string | null
  is_own_brand: boolean
  pages: SitePages
  is_active: boolean
  created_at: string
}

export interface DailySnapshot {
  id: string
  site_id: string
  snapshot_date: string
  scraped_at: string | null
  scrape_status: ScrapeStatus
  scrape_duration_seconds: number | null
  error_log: string | null
  created_at: string
}

export interface Promotion {
  id: string
  snapshot_id: string
  site_id: string
  snapshot_date: string
  promo_type: PromoType
  title: string | null
  description: string | null
  bonus_pct: number | null
  max_bonus: number | null
  min_deposit: number | null
  currency: string
  rollover: string | null
  validity: string | null
  promo_url: string | null
  raw_content: string | null
  is_active: boolean
  is_false_positive: boolean
  manually_edited: boolean
  created_at: string
}

export interface PromotionChange {
  id: string
  site_id: string
  promo_type: PromoType
  change_type: 'new' | 'modified' | 'removed'
  before_data: Partial<Promotion> | null
  after_data: Partial<Promotion> | null
  change_summary: string | null
  change_date: string
  alert_level: AlertLevel
  alert_sent: boolean
  created_at: string
}

export interface SeoSnapshot {
  id: string
  snapshot_id: string
  site_id: string
  snapshot_date: string
  url_checked: string
  title: string | null
  meta_description: string | null
  h1: string | null
  h2s: string[]
  canonical: string | null
  robots_meta: string | null
  has_schema: boolean
  schema_types: string[]
  is_indexable: boolean
  sitemap_url: string | null
  robots_txt_accessible: boolean
  created_at: string
}

export interface SeoChange {
  id: string
  site_id: string
  url_checked: string | null
  field_changed: string
  before_value: string | null
  after_value: string | null
  change_date: string
  alert_level: AlertLevel
  alert_sent: boolean
  created_at: string
}

export interface PageSpeedSnapshot {
  id: string
  snapshot_id: string
  site_id: string
  snapshot_date: string
  device: Device
  url_checked: string
  performance: number | null
  seo: number | null
  accessibility: number | null
  best_practices: number | null
  lcp: number | null
  inp: number | null
  cls: number | null
  fcp: number | null
  speed_index: number | null
  tbt: number | null
  opportunities: PageSpeedOpportunity[]
  diagnostics: PageSpeedDiagnostic[]
  created_at: string
}

export interface PageSpeedOpportunity {
  id: string
  title: string
  savings_ms?: number
  description?: string
}

export interface PageSpeedDiagnostic {
  id: string
  title: string
  description?: string
  score?: number
}

export interface Screenshot {
  id: string
  snapshot_id: string
  site_id: string
  snapshot_date: string
  page_type: PageType
  storage_path: string
  public_url: string
  file_size_kb: number | null
  width: number | null
  height: number | null
  created_at: string
}

export interface Alert {
  id: string
  site_id: string
  source_type: 'promotion' | 'seo' | 'pagespeed'
  alert_level: AlertLevel
  title: string
  description: string | null
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  url: string | null
  screenshot_id: string | null
  email_sent: boolean
  email_sent_at: string | null
  is_read: boolean
  is_false_positive: boolean
  conclusion: string | null
  created_at: string
}

export interface DailyReport {
  id: string
  report_date: string
  executive_summary: string | null
  promo_table: Record<string, unknown>
  aggressiveness_ranking: AggressivenessEntry[]
  pagespeed_comparison: Record<string, unknown>
  seo_changes_summary: Record<string, unknown>
  new_promos: Partial<Promotion>[]
  removed_promos: Partial<Promotion>[]
  conclusions: string | null
  recommendations: string | null
  created_at: string
}

export interface AggressivenessEntry {
  site_slug: string
  site_name: string
  score: number
  max_bonus: number | null
  promo_count: number
  highlight: string | null
}

export interface ScrapeLog {
  id: string
  run_date: string
  started_at: string
  finished_at: string | null
  status: 'running' | 'success' | 'partial' | 'failed'
  sites_ok: number
  sites_failed: number
  total_promos: number
  total_changes: number
  alerts_sent: number
  steps_log: ScrapeStep[]
  error_details: string | null
}

export interface ScrapeStep {
  site: string
  step: string
  status: 'ok' | 'error' | 'skip'
  duration_ms: number
  error?: string
}

export const PROMO_TYPE_LABELS: Record<PromoType, string> = {
  registro: 'Bono Registro',
  casino: 'Casino',
  deportes: 'Deportes',
  freebet: 'Freebet',
  freespin: 'Freespin',
  cashback: 'Cashback',
  torneo: 'Torneo',
  mision: 'Misión',
  codigo: 'Código Promo',
  otro: 'Otro',
}

export const ALERT_LEVEL_COLORS: Record<AlertLevel, string> = {
  high: 'red',
  medium: 'yellow',
  low: 'blue',
}
