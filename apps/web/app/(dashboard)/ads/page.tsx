import { createClient } from '@/lib/supabase/server'
import { Card, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Promotion, Site } from '@competencia/shared'

export const revalidate = 300

type AdSource = {
  id: string
  site_id: string
  platform: string
  source_url: string | null
  advertiser_name: string | null
  is_active: boolean
  notes: string | null
  sites: Site
}

function formatDateOnly(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('es-PE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)))
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function getGoogleTransparencyUrl(advertiserName: string | null) {
  if (!advertiserName) return null
  return `https://adstransparency.google.com/?region=PE&query=${encodeURIComponent(advertiserName)}`
}

function getMetaAdsLibraryUrl(sourceUrl: string | null, advertiserName: string | null) {
  const query = advertiserName || sourceUrl || ''
  if (!query) return null
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=PE&search_type=keyword_unordered&media_type=all&q=${encodeURIComponent(query)}`
}

function inferFunnelStage(promos: Promotion[]) {
  const text = normalize(promos.map(p => `${p.title ?? ''} ${p.description ?? ''} ${p.raw_content ?? ''}`).join(' '))

  if (text.includes('recarga')) return 'Recarga'
  if (text.includes('primer deposito') || text.includes('ftd')) return 'FTD'
  if (text.includes('registro') || text.includes('registrate') || text.includes('bienvenida') || text.includes('regalo')) return 'Registro'
  return 'Registro'
}

function inferMessage(promos: Promotion[]) {
  if (promos.length === 0) return 'Sin bono detectado'

  const titles = promos
    .map(p => p.title)
    .filter(Boolean)
    .slice(0, 2)

  if (titles.length === 0) return 'Bono detectado sin título'

  return titles.join(' + ')
}

function inferOfferTags(promos: Promotion[]) {
  const text = normalize(promos.map(p => `${p.title ?? ''} ${p.description ?? ''} ${p.raw_content ?? ''} ${p.rollover ?? ''}`).join(' '))
  const tags: string[] = []

  if (text.includes('sin rollover')) tags.push('Sin rollover')
  if (text.includes('freebet') || text.includes('free bet')) tags.push('Freebet')
  if (text.includes('giro') || text.includes('freespin')) tags.push('Giros')
  if (text.includes('100%') || promos.some(p => (p.bonus_pct ?? 0) >= 100)) tags.push('100% bono')
  if (promos.some(p => (p.max_bonus ?? 0) >= 500)) tags.push('Monto alto')
  if (promos.some(p => (p.min_deposit ?? 999999) <= 10)) tags.push('Depósito bajo')

  return tags
}

function riskLevel(siteSlug: string, promos: Promotion[]) {
  if (siteSlug === 'teapuesto') return 'Base'

  const tags = inferOfferTags(promos)
  const maxBonus = Math.max(0, ...promos.map(p => p.max_bonus ?? 0))

  if (tags.includes('Sin rollover')) return 'Alto'
  if (tags.includes('Depósito bajo')) return 'Alto'
  if (maxBonus >= 500) return 'Alto'
  if (tags.includes('Freebet') && tags.includes('Giros')) return 'Medio'
  if (tags.length > 0) return 'Medio'

  return 'Bajo'
}

function riskBadge(risk: string) {
  if (risk === 'Alto') return <Badge variant="red">Riesgo alto</Badge>
  if (risk === 'Medio') return <Badge variant="yellow">Riesgo medio</Badge>
  if (risk === 'Base') return <Badge variant="orange">TeApuesto</Badge>
  return <Badge variant="blue">Riesgo bajo</Badge>
}

function getRecommendation(siteSlug: string, promos: Promotion[]) {
  const tags = inferOfferTags(promos)
  const maxBonus = Math.max(0, ...promos.map(p => p.max_bonus ?? 0))

  if (siteSlug === 'teapuesto') {
    return 'Usar como benchmark propio: reforzar claridad del bono, CTA de registro y beneficio inmediato.'
  }

  if (tags.includes('Sin rollover')) {
    return 'Monitorear fuerte: el mensaje “sin rollover” puede afectar conversión de registro/FTD. Evaluar copy de simplicidad para TeApuesto.'
  }

  if (tags.includes('Depósito bajo')) {
    return 'Riesgo en FTD: competidor baja la barrera de entrada. Revisar comunicación de primer depósito o facilidad de activación.'
  }

  if (maxBonus >= 500) {
    return 'Competidor comunica monto alto. Contrarrestar destacando valor real, facilidad de uso y combinación freebet/giros.'
  }

  if (tags.includes('Freebet') && tags.includes('Giros')) {
    return 'Oferta mixta similar a TeApuesto. Diferenciar con confianza, rapidez de registro y omnicanalidad.'
  }

  return 'Mantener monitoreo. No se detecta una presión diferencial fuerte en captación.'
}

function sourceByPlatform(sources: AdSource[], platform: string) {
  return sources.find(s => s.platform === platform)
}

function SourceLink({
  label,
  url,
}: {
  label: string
  url: string | null
}) {
  if (!url) {
    return <span className="text-xs text-gray-600">—</span>
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-brand-500 hover:underline"
    >
      {label}
    </a>
  )
}

export default async function AdsPage() {
  const db = createClient()

  const { data: latestPromotion } = await db
    .from('promotions')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const date = latestPromotion?.snapshot_date ?? null

  const [{ data: sources }, { data: promos }, { data: sites }] = await Promise.all([
    db.from('ad_sources')
      .select('*, sites(*)')
      .eq('is_active', true)
      .order('platform', { ascending: true }),

    date
      ? db.from('promotions')
          .select('*')
          .eq('snapshot_date', date)
          .eq('is_false_positive', false)
          .eq('is_active', true)
      : Promise.resolve({ data: [] }),

    db.from('sites')
      .select('*')
      .eq('is_active', true)
      .order('is_own_brand', { ascending: false }),
  ])

  const allSources = (sources ?? []) as AdSource[]
  const allPromos = (promos ?? []) as Promotion[]
  const allSites = (sites ?? []) as Site[]

  const sourcesBySite: Record<string, AdSource[]> = {}
  const promosBySite: Record<string, Promotion[]> = {}

  for (const site of allSites) {
    sourcesBySite[site.slug] = allSources.filter(s => s.site_id === site.id)
    promosBySite[site.slug] = allPromos.filter(p => p.site_id === site.id && p.promo_type === 'registro')
  }

  const highRiskSites = allSites.filter(site => riskLevel(site.slug, promosBySite[site.slug] ?? []) === 'Alto')
  const metaActive = allSources.filter(s => s.platform === 'meta' && s.source_url).length
  const tiktokActive = allSources.filter(s => s.platform === 'tiktok' && s.source_url).length
  const googleNames = allSources.filter(s => s.platform === 'google' && s.advertiser_name).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Comunicación Ads</h1>
        <p className="text-gray-400 text-sm mt-1">
          {date ? `Benchmark de comunicación de captación al ${formatDateOnly(date)}` : 'Sin fecha disponible'}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="text-3xl font-bold text-brand-500">{allSites.length}</div>
          <div className="text-sm text-gray-400 mt-1">Marcas monitoreadas</div>
        </Card>

        <Card>
          <div className="text-3xl font-bold text-blue-400">{metaActive}</div>
          <div className="text-sm text-gray-400 mt-1">Fuentes Meta</div>
        </Card>

        <Card>
          <div className="text-3xl font-bold text-pink-400">{tiktokActive}</div>
          <div className="text-sm text-gray-400 mt-1">Fuentes TikTok</div>
        </Card>

        <Card>
          <div className="text-3xl font-bold text-yellow-400">{highRiskSites.length}</div>
          <div className="text-sm text-gray-400 mt-1">Riesgos altos</div>
        </Card>
      </div>

      <Card>
        <CardTitle>Lectura rápida</CardTitle>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <div className="text-gray-400 text-xs mb-1">Meta / Instagram</div>
            <div className="text-gray-200">
              Revisar copies activos de bono de bienvenida, freebet, giros, sin rollover y primer depósito.
            </div>
          </div>

          <div className="p-3 bg-gray-800/50 rounded-lg">
            <div className="text-gray-400 text-xs mb-1">Google</div>
            <div className="text-gray-200">
              Validar si el anunciante comunica bonos de registro en Search, YouTube o Display.
            </div>
          </div>

          <div className="p-3 bg-gray-800/50 rounded-lg">
            <div className="text-gray-400 text-xs mb-1">TikTok</div>
            <div className="text-gray-200">
              Detectar si el competidor usa mensajes simples de regalo, depósito bajo o activación rápida.
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Benchmark de comunicación por marca</CardTitle>

        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-2 pr-4 text-gray-500 font-medium w-36">Marca</th>
                <th className="text-left py-2 pr-4 text-gray-500 font-medium">Mensaje detectado</th>
                <th className="text-left py-2 pr-4 text-gray-500 font-medium w-24">Funnel</th>
                <th className="text-left py-2 pr-4 text-gray-500 font-medium w-40">Hooks</th>
                <th className="text-left py-2 pr-4 text-gray-500 font-medium w-28">Riesgo</th>
                <th className="text-left py-2 pr-4 text-gray-500 font-medium w-44">Fuentes</th>
                <th className="text-left py-2 text-gray-500 font-medium min-w-[280px]">Acción sugerida</th>
              </tr>
            </thead>

            <tbody>
              {allSites.map(site => {
                const siteSources = sourcesBySite[site.slug] ?? []
                const sitePromos = promosBySite[site.slug] ?? []

                const meta = sourceByPlatform(siteSources, 'meta')
                const instagram = sourceByPlatform(siteSources, 'instagram')
                const tiktok = sourceByPlatform(siteSources, 'tiktok')
                const google = sourceByPlatform(siteSources, 'google')

                const googleUrl = getGoogleTransparencyUrl(google?.advertiser_name ?? null)
                const metaLibraryUrl = getMetaAdsLibraryUrl(meta?.source_url ?? null, google?.advertiser_name ?? site.name)

                const tags = inferOfferTags(sitePromos)
                const risk = riskLevel(site.slug, sitePromos)

                return (
                  <tr
                    key={site.id}
                    className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${site.is_own_brand ? 'bg-orange-950/20' : ''}`}
                  >
                    <td className="py-3 pr-4 align-top">
                      <div className="flex items-center gap-1.5">
                        {site.is_own_brand && <span className="text-brand-500 text-xs">★</span>}
                        <span className={`font-medium ${site.is_own_brand ? 'text-brand-500' : 'text-gray-200'}`}>
                          {site.name}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 pr-4 align-top text-gray-300 max-w-sm">
                      <div className="font-medium line-clamp-2">
                        {inferMessage(sitePromos)}
                      </div>
                    </td>

                    <td className="py-3 pr-4 align-top">
                      <Badge variant="orange">{inferFunnelStage(sitePromos)}</Badge>
                    </td>

                    <td className="py-3 pr-4 align-top">
                      {tags.length === 0 ? (
                        <span className="text-xs text-gray-600">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 3).map(tag => (
                            <Badge key={tag} variant="default">{tag}</Badge>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="py-3 pr-4 align-top">
                      {riskBadge(risk)}
                    </td>

                    <td className="py-3 pr-4 align-top">
                      <div className="flex flex-col gap-1">
                        <SourceLink label="Meta Library" url={metaLibraryUrl} />
                        <SourceLink label="Facebook" url={meta?.source_url ?? null} />
                        <SourceLink label="Instagram" url={instagram?.source_url ?? null} />
                        <SourceLink label="TikTok" url={tiktok?.source_url ?? null} />
                        <SourceLink label="Google Ads" url={googleUrl} />
                      </div>
                    </td>

                    <td className="py-3 align-top text-xs text-gray-400">
                      {getRecommendation(site.slug, sitePromos)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardTitle>Checklist de monitoreo manual</CardTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-sm">
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <div className="font-medium text-gray-200">1. Meta Ads Library</div>
            <p className="text-xs text-gray-500 mt-1">
              Buscar si el competidor está usando palabras como gratis, bono, bienvenida, freebet, giros, sin rollover o primer depósito.
            </p>
          </div>

          <div className="p-3 bg-gray-800/50 rounded-lg">
            <div className="font-medium text-gray-200">2. Google Ads Transparency</div>
            <p className="text-xs text-gray-500 mt-1">
              Revisar si hay anuncios activos con foco en registro, casino, apuestas deportivas o depósito inicial.
            </p>
          </div>

          <div className="p-3 bg-gray-800/50 rounded-lg">
            <div className="font-medium text-gray-200">3. TikTok</div>
            <p className="text-xs text-gray-500 mt-1">
              Validar si están usando creadores, personajes, humor o mensajes simples de bono inmediato.
            </p>
          </div>

          <div className="p-3 bg-gray-800/50 rounded-lg">
            <div className="font-medium text-gray-200">4. Acción TeApuesto</div>
            <p className="text-xs text-gray-500 mt-1">
              Si aparece una oferta más simple o agresiva, probar copy alternativo en paid social, search y afiliados.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
