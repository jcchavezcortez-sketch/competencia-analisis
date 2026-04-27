import { createClient } from '@/lib/supabase/server'
import { Card, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { todayPE, formatDate } from '@/lib/utils'
import type { Promotion, Site } from '@competencia/shared'
import { PROMO_TYPE_LABELS } from '@competencia/shared'

export const revalidate = 300

const PROMO_TYPES = Object.keys(PROMO_TYPE_LABELS) as (keyof typeof PROMO_TYPE_LABELS)[]

export default async function PromotionsPage() {
  const db = createClient()
  const today = todayPE()

  const [{ data: promos }, { data: sites }] = await Promise.all([
    db.from('promotions')
      .select('*, sites(name,slug,is_own_brand)')
      .eq('snapshot_date', today)
      .eq('is_false_positive', false)
      .eq('is_active', true),
    db.from('sites').select('*').eq('is_active', true).order('is_own_brand', { ascending: false }),
  ])

  const allSites = (sites ?? []) as Site[]
  const allPromos = (promos ?? []) as (Promotion & { sites: { name: string; slug: string; is_own_brand: boolean } })[]

  // Organizar: tipo → sitio → promo
  const byType: Record<string, Record<string, Promotion[]>> = {}
  for (const pt of PROMO_TYPES) {
    byType[pt] = {}
    for (const site of allSites) {
      byType[pt][site.slug] = allPromos.filter(p => p.promo_type === pt && p.site_id === site.id)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Tabla Comparativa de Promociones</h1>
        <p className="text-gray-400 text-sm mt-1">{formatDate(today)}</p>
      </div>

      {PROMO_TYPES.map(type => {
        const hasAny = allSites.some(s => (byType[type][s.slug] ?? []).length > 0)
        if (!hasAny) return null

        return (
          <Card key={type}>
            <CardTitle>{PROMO_TYPE_LABELS[type]}</CardTitle>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium w-32">Marca</th>
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Título</th>
                    <th className="text-right py-2 pr-4 text-gray-500 font-medium">Bono %</th>
                    <th className="text-right py-2 pr-4 text-gray-500 font-medium">Máx PEN</th>
                    <th className="text-right py-2 pr-4 text-gray-500 font-medium">Dep. mín</th>
                    <th className="text-left py-2 text-gray-500 font-medium">Rollover</th>
                  </tr>
                </thead>
                <tbody>
                  {allSites.map(site => {
                    const sitePromos = byType[type][site.slug] ?? []
                    const main = sitePromos[0]

                    return (
                      <tr key={site.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${site.is_own_brand ? 'bg-orange-950/20' : ''}`}>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1.5">
                            {site.is_own_brand && <span className="text-brand-500 text-xs">★</span>}
                            <span className={`font-medium ${site.is_own_brand ? 'text-brand-500' : 'text-gray-200'}`}>
                              {site.name}
                            </span>
                          </div>
                        </td>
                        {main ? (
                          <>
                            <td className="py-3 pr-4 text-gray-300 max-w-xs">
                              <div className="truncate">{main.title}</div>
                              {main.description && (
                                <div className="text-xs text-gray-500 truncate mt-0.5">{main.description}</div>
                              )}
                            </td>
                            <td className="py-3 pr-4 text-right">
                              {main.bonus_pct ? (
                                <Badge variant="green">{main.bonus_pct}%</Badge>
                              ) : '—'}
                            </td>
                            <td className="py-3 pr-4 text-right font-semibold text-green-400">
                              {main.max_bonus ? `S/${main.max_bonus}` : '—'}
                            </td>
                            <td className="py-3 pr-4 text-right text-gray-400">
                              {main.min_deposit ? `S/${main.min_deposit}` : '—'}
                            </td>
                            <td className="py-3 text-gray-400 text-xs">{main.rollover ?? '—'}</td>
                          </>
                        ) : (
                          <td colSpan={5} className="py-3 text-gray-600 italic text-xs">
                            Sin promo de este tipo hoy
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )
      })}

      {allPromos.length === 0 && (
        <Card>
          <p className="text-gray-500 text-center py-8">
            Sin datos de promociones para hoy. El scraper se ejecuta a las 06:00 AM.
          </p>
        </Card>
      )}
    </div>
  )
}
