import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { todayPE, scoreColor, formatDate } from '@/lib/utils'
import Link from 'next/link'
import type { Site } from '@competencia/shared'

export const revalidate = 300

export default async function CompetitorsPage() {
  const db = createClient()
  const today = todayPE()

  const [{ data: sites }, { data: psi }, { data: promoCount }, { data: alerts }] = await Promise.all([
    db.from('sites').select('*').eq('is_active', true).order('is_own_brand', { ascending: false }),
    db.from('pagespeed_snapshots').select('site_id,device,performance').eq('snapshot_date', today).eq('device', 'mobile'),
    db.from('promotions').select('site_id').eq('snapshot_date', today).eq('is_false_positive', false),
    db.from('alerts').select('site_id,alert_level').gte('created_at', today).eq('is_false_positive', false),
  ])

  const allSites = (sites ?? []) as Site[]
  const psiMap = new Map<string, number | null>((psi ?? []).map((p: { site_id: string; performance: number | null }) => [p.site_id, p.performance]))
  const promoMap = new Map<string, number>()
  for (const p of (promoCount ?? [])) {
    promoMap.set(p.site_id, (promoMap.get(p.site_id) ?? 0) + 1)
  }
  const alertMap = new Map<string, number>()
  for (const a of (alerts ?? [])) {
    if (a.alert_level === 'high') alertMap.set(a.site_id, (alertMap.get(a.site_id) ?? 0) + 1)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Competidores</h1>
        <p className="text-gray-400 text-sm mt-1">{formatDate(today)}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {allSites.map(site => {
          const perf = psiMap.get(site.id) ?? null
          const promos = promoMap.get(site.id) ?? 0
          const highAlerts = alertMap.get(site.id) ?? 0

          return (
            <Link key={site.id} href={`/competitors/${site.slug}`}>
              <Card className={`hover:border-gray-600 transition-all cursor-pointer h-full ${site.is_own_brand ? 'border-brand-500/50 bg-orange-950/10' : ''}`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className={`font-semibold ${site.is_own_brand ? 'text-brand-500' : 'text-gray-100'}`}>
                        {site.name}
                      </h3>
                      {site.is_own_brand && <Badge variant="orange">Nosotros</Badge>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{site.url}</div>
                  </div>
                  {highAlerts > 0 && (
                    <Badge variant="red">{highAlerts} alerta{highAlerts !== 1 ? 's' : ''}</Badge>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${scoreColor(perf)}`}>{perf ?? '—'}</div>
                    <div className="text-xs text-gray-500 mt-0.5">PSI mobile</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-200">{promos}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Promos hoy</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-400">{highAlerts}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Alertas altas</div>
                  </div>
                </div>

                <div className="mt-4 text-xs text-brand-500 hover:underline">
                  Ver detalle →
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
