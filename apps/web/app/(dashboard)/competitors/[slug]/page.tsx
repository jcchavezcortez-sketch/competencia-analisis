import { createClient } from '@/lib/supabase/server'
import { Card, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { todayPE, formatDate, formatDateTime, scoreColor, alertLevelLabel, alertLevelColor } from '@/lib/utils'
import { PROMO_TYPE_LABELS } from '@competencia/shared'
import type { Site, Promotion, SeoSnapshot, Alert, Screenshot } from '@competencia/shared'
import Image from 'next/image'
import { notFound } from 'next/navigation'

export const revalidate = 300

export default async function CompetitorDetailPage({ params }: { params: { slug: string } }) {
  const db = createClient()
  const today = todayPE()

  const { data: siteData } = await db.from('sites').select('*').eq('slug', params.slug).maybeSingle()
  if (!siteData) notFound()
  const site = siteData as Site

  const [
    { data: promos },
    { data: seo },
    { data: psiMobile },
    { data: psiDesktop },
    { data: screenshots },
    { data: alerts },
  ] = await Promise.all([
    db.from('promotions').select('*').eq('site_id', site.id).eq('snapshot_date', today).eq('is_false_positive', false),
    db.from('seo_snapshots').select('*').eq('site_id', site.id).eq('snapshot_date', today).maybeSingle(),
    db.from('pagespeed_snapshots').select('*').eq('site_id', site.id).eq('snapshot_date', today).eq('device', 'mobile').maybeSingle(),
    db.from('pagespeed_snapshots').select('*').eq('site_id', site.id).eq('snapshot_date', today).eq('device', 'desktop').maybeSingle(),
    db.from('screenshots').select('*').eq('site_id', site.id).eq('snapshot_date', today).order('page_type'),
    db.from('alerts').select('*').eq('site_id', site.id).eq('is_false_positive', false)
      .gte('created_at', today).order('created_at', { ascending: false }).limit(10),
  ])

  const allPromos = (promos ?? []) as Promotion[]
  const seoSnap = seo as SeoSnapshot | null
  const allAlerts = (alerts ?? []) as Alert[]
  const allScreenshots = (screenshots ?? []) as Screenshot[]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-100">{site.name}</h1>
            {site.is_own_brand && <Badge variant="orange">Nosotros</Badge>}
          </div>
          <a href={site.url} target="_blank" rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:underline mt-1 block">
            {site.url}
          </a>
          <p className="text-gray-500 text-xs mt-1">{formatDate(today)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PageSpeed */}
        <Card>
          <CardTitle>PageSpeed</CardTitle>
          <div className="grid grid-cols-2 gap-4">
            {[{ label: 'Mobile', data: psiMobile }, { label: 'Desktop', data: psiDesktop }].map(({ label, data: psi }) => (
              <div key={label}>
                <div className="text-xs text-gray-500 mb-2">{label}</div>
                {psi ? (
                  <div className="space-y-1.5">
                    {[
                      { k: 'Performance', v: psi.performance },
                      { k: 'SEO', v: psi.seo },
                      { k: 'Accesib.', v: psi.accessibility },
                    ].map(({ k, v }) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-20">{k}</span>
                        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${(v ?? 0) >= 90 ? 'bg-green-500' : (v ?? 0) >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${v ?? 0}%` }}
                          />
                        </div>
                        <span className={`text-xs font-semibold w-8 text-right ${scoreColor(v ?? null)}`}>{v ?? '—'}</span>
                      </div>
                    ))}
                    <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-gray-400">
                      <span>LCP: {psi.lcp ? `${(psi.lcp / 1000).toFixed(1)}s` : '—'}</span>
                      <span>FCP: {psi.fcp ? `${(psi.fcp / 1000).toFixed(1)}s` : '—'}</span>
                      <span>TBT: {psi.tbt ? `${psi.tbt}ms` : '—'}</span>
                      <span>CLS: {psi.cls?.toFixed(3) ?? '—'}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600 text-xs">Sin datos</p>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* SEO */}
        <Card>
          <CardTitle>SEO Visible</CardTitle>
          {seoSnap ? (
            <div className="space-y-3 text-sm">
              {[
                { label: 'Title', value: seoSnap.title },
                { label: 'Meta Desc.', value: seoSnap.meta_description },
                { label: 'H1', value: seoSnap.h1 },
                { label: 'Canonical', value: seoSnap.canonical },
                { label: 'Robots', value: seoSnap.robots_meta },
              ].map(({ label, value }) => value && (
                <div key={label}>
                  <div className="text-xs text-gray-500 mb-0.5">{label}</div>
                  <div className="text-gray-300 text-xs leading-relaxed">{value}</div>
                </div>
              ))}
              <div className="flex gap-2 flex-wrap mt-2">
                <Badge variant={seoSnap.is_indexable ? 'green' : 'red'}>
                  {seoSnap.is_indexable ? 'Indexable' : 'No indexable'}
                </Badge>
                {seoSnap.has_schema && <Badge variant="blue">Schema markup</Badge>}
                {seoSnap.robots_txt_accessible && <Badge variant="blue">robots.txt ✓</Badge>}
                {seoSnap.sitemap_url && <Badge variant="blue">sitemap.xml ✓</Badge>}
              </div>
              {(seoSnap.h2s ?? []).length > 0 && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">H2s principales</div>
                  <ul className="space-y-1">
                    {(seoSnap.h2s ?? []).slice(0, 5).map((h, i) => (
                      <li key={i} className="text-xs text-gray-400">• {h}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-600 text-sm">Sin datos SEO para hoy.</p>
          )}
        </Card>
      </div>

      {/* Promociones */}
      <Card>
        <CardTitle>Promociones detectadas hoy</CardTitle>
        {allPromos.length === 0 ? (
          <p className="text-gray-600 text-sm">Sin promociones detectadas.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {allPromos.map(promo => (
              <div key={promo.id} className="border border-gray-800 rounded-lg p-4 bg-gray-800/30">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="default">{PROMO_TYPE_LABELS[promo.promo_type]}</Badge>
                  {promo.max_bonus && <span className="text-green-400 text-sm font-semibold">S/{promo.max_bonus}</span>}
                </div>
                {promo.title && <div className="text-sm font-medium text-gray-200">{promo.title}</div>}
                {promo.description && <div className="text-xs text-gray-400 mt-1">{promo.description}</div>}
                <div className="flex gap-3 mt-3 text-xs text-gray-500">
                  {promo.bonus_pct && <span>Bono: {promo.bonus_pct}%</span>}
                  {promo.min_deposit && <span>Dep. mín: S/{promo.min_deposit}</span>}
                  {promo.rollover && <span>Rollover: {promo.rollover}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Screenshots */}
      {allScreenshots.length > 0 && (
        <Card>
          <CardTitle>Screenshots de hoy</CardTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {allScreenshots.map(ss => (
              <a key={ss.id} href={ss.public_url} target="_blank" rel="noopener noreferrer"
                className="block rounded-lg overflow-hidden border border-gray-800 hover:border-gray-600 transition-colors">
                <div className="relative aspect-video bg-gray-800">
                  <Image src={ss.public_url} alt={ss.page_type} fill className="object-cover object-top" />
                </div>
                <div className="px-2 py-1.5 text-xs text-gray-400 capitalize">{ss.page_type}</div>
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* Alertas */}
      {allAlerts.length > 0 && (
        <Card>
          <CardTitle>Alertas del día</CardTitle>
          <div className="space-y-2">
            {allAlerts.map(alert => (
              <div key={alert.id} className={`border rounded-lg p-3 ${alertLevelColor(alert.alert_level)}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs">{alertLevelLabel(alert.alert_level)}</span>
                  <span className="text-xs font-medium">{alert.title}</span>
                </div>
                {alert.conclusion && (
                  <p className="text-xs opacity-80 mt-1">{alert.conclusion}</p>
                )}
                <div className="text-xs opacity-50 mt-1">{formatDateTime(alert.created_at)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
