import { createClient } from '@/lib/supabase/server'
import { Card, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { alertLevelLabel, alertLevelColor, scoreColor } from '@/lib/utils'
import Link from 'next/link'
import type { Alert, DailyReport, AggressivenessEntry, PageSpeedSnapshot } from '@competencia/shared'

export const revalidate = 300

function formatDateOnly(date: string) {
  const [year, month, day] = date.split('-').map(Number)

  return new Intl.DateTimeFormat('es-PE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)))
}

function getSiteObject(row: any) {
  if (Array.isArray(row?.sites)) return row.sites[0]
  return row?.sites
}

function buildRankingFallback(promotions: any[]): AggressivenessEntry[] {
  const grouped = new Map<string, any>()

  for (const promo of promotions) {
    const site = getSiteObject(promo)
    if (!site?.slug) continue

    const current = grouped.get(site.slug) ?? {
      site_slug: site.slug,
      site_name: site.name,
      promo_count: 0,
      max_bonus: null,
      highlight: '',
    }

    current.promo_count += 1

    if (promo.max_bonus && (!current.max_bonus || Number(promo.max_bonus) > Number(current.max_bonus))) {
      current.max_bonus = Number(promo.max_bonus)
      current.highlight = promo.title ?? promo.description ?? ''
    }

    grouped.set(site.slug, current)
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const bonusA = Number(a.max_bonus ?? 0)
    const bonusB = Number(b.max_bonus ?? 0)

    if (b.promo_count !== a.promo_count) return b.promo_count - a.promo_count
    return bonusB - bonusA
  })
}

async function getDashboardData() {
  const db = createClient()

  const [{ data: latestReport }, { data: latestSnapshot }] = await Promise.all([
    db.from('daily_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    db.from('daily_snapshots')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const date = latestReport?.report_date ?? latestSnapshot?.snapshot_date ?? null

  if (!date) {
    return {
      date: null,
      report: null,
      alerts: [],
      psi: [],
      scrapeLog: null,
      snapshots: [],
      promotions: [],
    }
  }

  const [
    { data: report },
    { data: alerts },
    { data: psi },
    { data: scrapeLog },
    { data: snapshots },
    { data: promotions },
  ] = await Promise.all([
    db.from('daily_reports')
      .select('*')
      .eq('report_date', date)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    db.from('alerts')
      .select('*, sites(name,slug)')
      .eq('is_false_positive', false)
      .order('created_at', { ascending: false })
      .limit(50),

    db.from('pagespeed_snapshots')
      .select('*, sites(name,slug,is_own_brand)')
      .eq('snapshot_date', date)
      .eq('device', 'mobile'),

    db.from('scrape_logs')
      .select('*')
      .eq('run_date', date)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    db.from('daily_snapshots')
      .select('id, site_id, scrape_status')
      .eq('snapshot_date', date),

    db.from('promotions')
      .select('id, site_id, title, description, max_bonus, promo_type, is_false_positive, sites(name,slug,is_own_brand)')
      .eq('snapshot_date', date)
      .eq('is_false_positive', false),
  ])

  const alertsForDate = (alerts ?? []).filter((alert: any) => {
    const createdDate = String(alert.created_at ?? '').slice(0, 10)
    return createdDate === date
  })

  return {
    date,
    report,
    alerts: alertsForDate,
    psi: psi ?? [],
    scrapeLog,
    snapshots: snapshots ?? [],
    promotions: promotions ?? [],
  }
}

export default async function DashboardPage() {
  const { date, report, alerts, psi, scrapeLog, snapshots, promotions } = await getDashboardData()

  const dailyReport = report as DailyReport | null
  const reportRanking = (dailyReport?.aggressiveness_ranking ?? []) as AggressivenessEntry[]
  const fallbackRanking = buildRankingFallback(promotions)
  const ranking = reportRanking.length > 0 ? reportRanking : fallbackRanking

  const typedAlerts = alerts as (Alert & { sites: { name: string; slug: string } })[]
  const highAlerts = typedAlerts.filter(a => a.alert_level === 'high')

  const psiData = psi as (PageSpeedSnapshot & { sites: { name: string; slug: string; is_own_brand: boolean } })[]
  const ownPsi = psiData.find(p => p.sites?.is_own_brand)

  const monitoredSites = snapshots.length > 0 ? snapshots.length : psiData.length
  const detectedChanges = typedAlerts.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Resumen del día</h1>
          <p className="text-gray-400 text-sm mt-1">
            {date ? formatDateOnly(date) : 'Sin fecha disponible'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {scrapeLog && (
            <Badge variant={scrapeLog.status === 'success' ? 'green' : scrapeLog.status === 'partial' ? 'yellow' : 'red'}>
              Scraper: {scrapeLog.status}
            </Badge>
          )}

          {highAlerts.length > 0 && (
            <Link href="/alerts">
              <Badge variant="red">
                {highAlerts.length} alerta{highAlerts.length !== 1 ? 's' : ''} alta{highAlerts.length !== 1 ? 's' : ''}
              </Badge>
            </Link>
          )}
        </div>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="text-3xl font-bold text-brand-500">{monitoredSites}</div>
          <div className="text-sm text-gray-400 mt-1">Sitios monitoreados</div>
        </Card>

        <Card>
          <div className="text-3xl font-bold text-brand-500">{detectedChanges}</div>
          <div className="text-sm text-gray-400 mt-1">Cambios detectados</div>
        </Card>

        <Card>
          <div className={`text-3xl font-bold ${scoreColor(ownPsi?.performance ?? null)}`}>
            {ownPsi?.performance ?? '—'}
          </div>
          <div className="text-sm text-gray-400 mt-1">PSI mobile TeApuesto</div>
        </Card>

        <Card>
          <div className="text-3xl font-bold text-yellow-400">{highAlerts.length}</div>
          <div className="text-sm text-gray-400 mt-1">Alertas altas</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ranking agresividad */}
        <Card>
          <CardTitle>Ranking Agresividad Promocional</CardTitle>

          {ranking.length === 0 ? (
            <p className="text-gray-500 text-sm">Sin datos para la última fecha disponible.</p>
          ) : (
            <div className="space-y-3">
              {ranking.map((entry, i) => (
                <Link key={entry.site_slug} href={`/competitors/${entry.site_slug}`}>
                  <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer">
                    <span className="text-lg font-bold text-gray-500 w-6">{i + 1}</span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-200 text-sm">{entry.site_name}</span>

                        {entry.site_slug === 'teapuesto' && (
                          <Badge variant="orange">Nosotros</Badge>
                        )}
                      </div>

                      {entry.highlight && (
                        <div className="text-xs text-gray-500 mt-0.5 truncate">{entry.highlight}</div>
                      )}
                    </div>

                    <div className="text-right">
                      {entry.max_bonus && (
                        <div className="text-sm font-semibold text-green-400">S/{entry.max_bonus}</div>
                      )}

                      <div className="text-xs text-gray-500">{entry.promo_count} promos</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Alertas recientes */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle className="mb-0">Alertas Recientes</CardTitle>
            <Link href="/alerts" className="text-xs text-brand-500 hover:underline">Ver todas →</Link>
          </div>

          {typedAlerts.length === 0 ? (
            <p className="text-gray-500 text-sm">Sin alertas para la última fecha disponible.</p>
          ) : (
            <div className="space-y-2">
              {typedAlerts.slice(0, 6).map(alert => (
                <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-lg border ${alertLevelColor(alert.alert_level)}`}>
                  <div className="text-xs leading-none mt-0.5">{alertLevelLabel(alert.alert_level).split(' ')[0]}</div>

                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{alert.title}</div>

                    {alert.description && (
                      <div className="text-xs opacity-70 mt-0.5 truncate">{alert.description}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* PageSpeed comparativo */}
      <Card>
        <CardTitle>PageSpeed Mobile — Comparativo</CardTitle>

        <div className="space-y-3">
          {psiData.length === 0 ? (
            <p className="text-gray-500 text-sm">Sin datos de PageSpeed para la última fecha disponible.</p>
          ) : (
            [...psiData]
              .sort((a, b) => (b.performance ?? 0) - (a.performance ?? 0))
              .map(p => {
                const pct = p.performance ?? 0

                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <div className="w-32 text-sm text-gray-300 truncate flex items-center gap-1">
                      {p.sites?.is_own_brand && <span className="text-brand-500">★</span>}
                      {p.sites?.name ?? '?'}
                    </div>

                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          pct >= 90 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className={`w-10 text-right text-sm font-semibold ${scoreColor(pct)}`}>
                      {pct}
                    </div>
                  </div>
                )
              })
          )}
        </div>
      </Card>

      {/* Conclusiones IA */}
      {dailyReport?.conclusions && (
        <Card>
          <CardTitle>Conclusiones del Día (IA)</CardTitle>
          <div className="prose prose-sm prose-invert max-w-none">
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{dailyReport.conclusions}</p>
          </div>
        </Card>
      )}

      {dailyReport?.recommendations && (
        <Card>
          <CardTitle>Recomendaciones</CardTitle>
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{dailyReport.recommendations}</p>
        </Card>
      )}
    </div>
  )
}
