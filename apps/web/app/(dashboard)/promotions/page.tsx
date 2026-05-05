import { createClient } from '@/lib/supabase/server'
import { Card, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { Promotion, Site } from '@competencia/shared'

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

function inferCategory(title: string, description: string): string | null {
  const text = `${title} ${description}`.toLowerCase()

  if (
    text.includes('casino') ||
    text.includes('giro') ||
    text.includes('giros') ||
    text.includes('freespin') ||
    text.includes('freespins')
  ) return 'Casino'

  if (
    text.includes('deport') ||
    text.includes('fútbol') ||
    text.includes('futbol') ||
    text.includes('apuesta deportiva') ||
    text.includes('freebet') ||
    text.includes('free bet')
  ) return 'Deportes'

  return null
}

function inferMechanic(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase()

  if (text.includes('primer depósito') || text.includes('primer deposito') || text.includes('ftd')) {
    return 'Registro + FTD'
  }

  if (text.includes('recarga')) {
    return 'Registro + recarga'
  }

  if (text.includes('regalo')) {
    return 'Registro + regalo'
  }

  if (text.includes('bienvenida')) {
    return 'Bono bienvenida'
  }

  return 'Registro'
}

function isWelcomePromo(promo: Promotion): boolean {
  const text = `${promo.title ?? ''} ${promo.description ?? ''} ${promo.raw_content ?? ''}`.toLowerCase()

  if (promo.promo_type === 'registro') return true

  return [
    'bienvenida',
    'registro',
    'regístrate',
    'registrate',
    'regalo',
    'primer depósito',
    'primer deposito',
    'ftd',
    'freebet',
    'giros gratis',
    'freespins',
  ].some(term => text.includes(term))
}

export default async function PromotionsPage() {
  const db = createClient()

  const { data: latestPromotion } = await db
    .from('promotions')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const date = latestPromotion?.snapshot_date ?? null

  const [{ data: promos }, { data: sites }] = await Promise.all([
    date
      ? db.from('promotions')
          .select('*, sites(name,slug,is_own_brand)')
          .eq('snapshot_date', date)
          .eq('is_false_positive', false)
          .eq('is_active', true)
      : Promise.resolve({ data: [] }),

    db.from('sites')
      .select('*')
      .eq('is_active', true)
      .order('is_own_brand', { ascending: false }),
  ])

  const allSites = (sites ?? []) as Site[]
  const allPromos = ((promos ?? []) as (Promotion & { sites: { name: string; slug: string; is_own_brand: boolean } })[])
    .filter(isWelcomePromo)

  const bySite: Record<string, Promotion[]> = {}

  for (const site of allSites) {
    bySite[site.slug] = allPromos.filter(p => p.site_id === site.id)
  }

  const hasAny = allSites.some(s => (bySite[s.slug] ?? []).length > 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Bonos de Bienvenida / Registro</h1>
        <p className="text-gray-400 text-sm mt-1">
          {date ? formatDateOnly(date) : 'Sin fecha disponible'}
        </p>
      </div>

      <Card>
        <CardTitle>Comparativo de ofertas de captación</CardTitle>
        <p className="text-xs text-gray-500 mb-4">
          Incluye bonos de bienvenida, registro, regalo de bienvenida, registro + regalo, registro + recarga y FTD / primer depósito.
        </p>

        {!hasAny ? (
          <p className="text-gray-500 text-center py-8">
            Sin datos de bonos de bienvenida para la última fecha disponible.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium w-32">Marca</th>
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium">Promoción</th>
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium w-32">Mecánica</th>
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium w-24">Vertical</th>
                  <th className="text-right py-2 pr-4 text-gray-500 font-medium w-20">Bono %</th>
                  <th className="text-right py-2 pr-4 text-gray-500 font-medium w-24">Máx PEN</th>
                  <th className="text-right py-2 pr-4 text-gray-500 font-medium w-24">Dep. mín</th>
                  <th className="text-left py-2 text-gray-500 font-medium">Rollover</th>
                </tr>
              </thead>
              <tbody>
                {allSites.map(site => {
                  const sitePromos = bySite[site.slug] ?? []

                  if (sitePromos.length === 0) {
                    return (
                      <tr key={site.id} className={`border-b border-gray-800/50 ${site.is_own_brand ? 'bg-orange-950/20' : ''}`}>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1.5">
                            {site.is_own_brand && <span className="text-brand-500 text-xs">★</span>}
                            <span className={`font-medium ${site.is_own_brand ? 'text-brand-500' : 'text-gray-200'}`}>
                              {site.name}
                            </span>
                          </div>
                        </td>
                        <td colSpan={7} className="py-3 text-gray-600 italic text-xs">
                          Sin bono de bienvenida registrado para esta fecha
                        </td>
                      </tr>
                    )
                  }

                  return sitePromos.map((promo, idx) => {
                    const category = inferCategory(promo.title ?? '', promo.description ?? '')
                    const mechanic = inferMechanic(promo.title ?? '', promo.description ?? '')

                    return (
                      <tr
                        key={promo.id}
                        className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${site.is_own_brand ? 'bg-orange-950/20' : ''}`}
                      >
                        <td className="py-3 pr-4 align-top">
                          {idx === 0 && (
                            <div className="flex items-center gap-1.5">
                              {site.is_own_brand && <span className="text-brand-500 text-xs">★</span>}
                              <span className={`font-medium ${site.is_own_brand ? 'text-brand-500' : 'text-gray-200'}`}>
                                {site.name}
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="py-3 pr-4 text-gray-300 min-w-[280px] max-w-md">
                          {promo.promo_url ? (
                            <a
                              href={promo.promo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium hover:text-brand-500 hover:underline transition-colors"
                            >
                              {promo.title}
                            </a>
                          ) : (
                            <span className="font-medium">{promo.title}</span>
                          )}

                          {promo.description && (
                            <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                              {promo.description}
                            </div>
                          )}
                        </td>

                        <td className="py-3 pr-4 align-top">
                          <Badge variant="orange">{mechanic}</Badge>
                        </td>

                        <td className="py-3 pr-4 align-top">
                          {category ? (
                            <Badge variant={category === 'Casino' ? 'blue' : 'green'}>
                              {category}
                            </Badge>
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>

                        <td className="py-3 pr-4 text-right align-top">
                          {promo.bonus_pct ? (
                            <Badge variant="green">{promo.bonus_pct}%</Badge>
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>

                        <td className="py-3 pr-4 text-right align-top font-semibold text-green-400">
                          {promo.max_bonus ? `S/${promo.max_bonus}` : <span className="text-gray-600 font-normal text-xs">—</span>}
                        </td>

                        <td className="py-3 pr-4 text-right align-top text-gray-400">
                          {promo.min_deposit ? `S/${promo.min_deposit}` : <span className="text-gray-600 text-xs">—</span>}
                        </td>

                        <td className="py-3 align-top text-gray-400 text-xs">
                          {promo.rollover ?? <span className="text-gray-600">—</span>}
                        </td>
                      </tr>
                    )
                  })
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
