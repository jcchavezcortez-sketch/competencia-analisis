import { createClient } from '@/lib/supabase/server'
import { Card, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { todayPE, formatDate, scoreColor } from '@/lib/utils'
import type { PageSpeedSnapshot, Site } from '@competencia/shared'

export const revalidate = 3600

function ScoreBar({ score }: { score: number | null }) {
  const pct = score ?? 0
  const color = pct >= 90 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-sm font-semibold w-8 text-right ${scoreColor(score)}`}>{score ?? '—'}</span>
    </div>
  )
}

function MetricCell({ value, unit = 'ms' }: { value: number | null; unit?: string }) {
  if (value === null) return <span className="text-gray-600">—</span>
  const ms = unit === 'ms' ? value : value
  const color = unit === 'ms'
    ? ms < 2500 ? 'text-green-400' : ms < 4000 ? 'text-yellow-400' : 'text-red-400'
    : ms < 0.1 ? 'text-green-400' : ms < 0.25 ? 'text-yellow-400' : 'text-red-400'
  return <span className={`text-sm font-medium ${color}`}>{unit === 'ms' ? `${(ms / 1000).toFixed(1)}s` : ms.toFixed(3)}</span>
}

export default async function PageSpeedPage() {
  const db = createClient()
  const today = todayPE()

  const { data } = await db
    .from('pagespeed_snapshots')
    .select('*, sites(name,slug,is_own_brand)')
    .eq('snapshot_date', today)
    .order('performance', { ascending: false })

  const allData = (data ?? []) as (PageSpeedSnapshot & { sites: Site })[]
  const mobileData = allData.filter(d => d.device === 'mobile')
  const desktopData = allData.filter(d => d.device === 'desktop')

  const devices = [
    { label: 'Mobile', data: mobileData },
    { label: 'Desktop', data: desktopData },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">PageSpeed Insights</h1>
        <p className="text-gray-400 text-sm mt-1">{formatDate(today)}</p>
      </div>

      {devices.map(({ label, data: deviceData }) => (
        <Card key={label}>
          <CardTitle>{label}</CardTitle>
          {deviceData.length === 0 ? (
            <p className="text-gray-500 text-sm">Sin datos para hoy.</p>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500">
                    <th className="text-left py-2 pr-6 font-medium">Sitio</th>
                    <th className="text-left py-2 pr-4 font-medium w-36">Performance</th>
                    <th className="text-left py-2 pr-4 font-medium w-28">SEO</th>
                    <th className="text-left py-2 pr-4 font-medium w-28">Accesib.</th>
                    <th className="text-right py-2 pr-4 font-medium">LCP</th>
                    <th className="text-right py-2 pr-4 font-medium">FCP</th>
                    <th className="text-right py-2 pr-4 font-medium">TBT</th>
                    <th className="text-right py-2 font-medium">CLS</th>
                  </tr>
                </thead>
                <tbody>
                  {deviceData.map(row => (
                    <tr key={row.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${row.sites?.is_own_brand ? 'bg-orange-950/20' : ''}`}>
                      <td className="py-3 pr-6">
                        <div className="flex items-center gap-1.5">
                          {row.sites?.is_own_brand && <span className="text-brand-500 text-xs">★</span>}
                          <span className={row.sites?.is_own_brand ? 'text-brand-500 font-medium' : 'text-gray-200'}>
                            {row.sites?.name ?? '?'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4"><ScoreBar score={row.performance} /></td>
                      <td className="py-3 pr-4"><ScoreBar score={row.seo} /></td>
                      <td className="py-3 pr-4"><ScoreBar score={row.accessibility} /></td>
                      <td className="py-3 pr-4 text-right"><MetricCell value={row.lcp} /></td>
                      <td className="py-3 pr-4 text-right"><MetricCell value={row.fcp} /></td>
                      <td className="py-3 pr-4 text-right"><MetricCell value={row.tbt} /></td>
                      <td className="py-3 text-right"><MetricCell value={row.cls} unit="cls" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ))}

      {/* Oportunidades TeApuesto */}
      {(() => {
        const own = mobileData.find(d => d.sites?.is_own_brand)
        const opportunities = own?.opportunities ?? []
        if (opportunities.length === 0) return null
        return (
          <Card>
            <CardTitle>Oportunidades de mejora — TeApuesto Mobile</CardTitle>
            <div className="space-y-3">
              {(opportunities as { id: string; title: string; savings_ms?: number }[]).map(op => (
                <div key={op.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                  <span className="text-sm text-gray-300">{op.title}</span>
                  {op.savings_ms && (
                    <Badge variant="yellow">-{(op.savings_ms / 1000).toFixed(1)}s</Badge>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )
      })()}
    </div>
  )
}
