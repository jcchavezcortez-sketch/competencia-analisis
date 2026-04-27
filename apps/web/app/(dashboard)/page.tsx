import { createClient } from '@/lib/supabase/server'
import { Card, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { todayPE, formatDate, alertLevelLabel, alertLevelColor, scoreColor } from '@/lib/utils'
import Link from 'next/link'
import type { Alert, DailyReport, AggressivenessEntry, PageSpeedSnapshot } from '@competencia/shared'

export const revalidate = 3600

async function getDashboardData(date: string) {
  const db = createClient()

  const [
    { data: report },
    { data: alerts },
    { data: psi },
    { data: scrapeLog },
  ] = await Promise.all([
    db.from('daily_reports').select('*').eq('report_date', date).maybeSingle(),
    db.from('alerts').select('*, sites(name,slug)').eq('is_false_positive', false)
      .gte('created_at', date).order('created_at', { ascending: false }).limit(10),
    db.from('pagespeed_snapshots').select('*, sites(name,slug,is_own_brand)')
      .eq('snapshot_date', date).eq('device', 'mobile'),
    db.from('scrape_logs').select('*').eq('run_date', date).order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  return { report, alerts: alerts ?? [], psi: psi ?? [], scrapeLog }
}

export default async function DashboardPage() {
  const today = todayPE()
  const { report, alerts, psi, scrapeLog } = await getDashboardData(today)

  const dailyReport = report as DailyReport | null
  const ranking = (dailyReport?.aggressiveness_ranking ?? []) as AggressivenessEntry[]
  const highAlerts = (alerts as (Alert & { sites: { name: string; slug: string } })[]).filter(a => a.alert_level === 'high')
  const psiData = psi as (PageSpeedSnapshot & { sites: { name: string; slug: string; is_own_brand: boolean } })[]

  const ownPsi = psiData.find(p => p.sites?.is_own_brand)
  const competitorsPsi = psiData.filter(p => !p.sites?.is_own_brand)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Resumen del día</h1>
          <p className="text-gray-400 text-sm mt-1">{formatDate(today)}</p>
        </div>
        <div className="flex items-center gap-3">
          {scrapeLog && (
            <Badge variant={scrapeLog.status === 'success' ? 'green' : scrapeLog.status === 'partial' ? 'yellow' : 'red'}>
              Scraper: {scrapeLog.status}
            </Badge>
          )}
          {highAlerts.length > 0 && (
            <Link href="/alerts">
              <Badge variant="red">{highAlerts.length} alerta{highAlerts.length !== 1 ? 's' : ''} alta{highAlerts.length !== 1 ? 's' : ''}</Badge>
            </Link>
          )}
        </div>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="text-3xl font-bold text-brand-500">{psiData.length}</div>
          <div className="text-sm text-gray-400 mt-1">Sitios monitoreados</div>
        </Card>
        <Card>
          <div className="text-3xl font-bold text-brand-500">
            {alerts.filter((a: Alert) => a.alert_level !== 'low').length}
          </div>
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
            <p className="text-gray-500 text-sm">Sin datos para hoy. Ejecuta el scraper.</p>
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
          {alerts.length === 0 ? (
            <p className="text-gray-500 text-sm">Sin alertas hoy.</p>
          ) : (
            <div className="space-y-2">
              {(alerts as (Alert & { sites: { name: string } })[]).slice(0, 6).map(alert => (
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
            <p className="text-gray-500 text-sm">Sin datos de PageSpeed para hoy.</p>
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
