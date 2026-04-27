import { createClient } from '@/lib/supabase/server'
import { Card, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { todayPE, formatDate } from '@/lib/utils'
import type { SeoSnapshot, Site } from '@competencia/shared'

export const revalidate = 3600

export default async function SeoPage() {
  const db = createClient()
  const today = todayPE()

  const [{ data: seoData }, { data: seoChanges }] = await Promise.all([
    db.from('seo_snapshots')
      .select('*, sites(name,slug,is_own_brand)')
      .eq('snapshot_date', today),
    db.from('seo_changes')
      .select('*, sites(name,slug)')
      .eq('change_date', today)
      .order('alert_level', { ascending: false }),
  ])

  const allSeo = (seoData ?? []) as (SeoSnapshot & { sites: Site })[]
  const changes = (seoChanges ?? []) as {
    id: string; field_changed: string; before_value: string | null;
    after_value: string | null; alert_level: string;
    sites: { name: string; slug: string }
  }[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">SEO Visible</h1>
        <p className="text-gray-400 text-sm mt-1">{formatDate(today)}</p>
      </div>

      {/* Cambios del día */}
      {changes.length > 0 && (
        <Card>
          <CardTitle>Cambios SEO detectados hoy</CardTitle>
          <div className="space-y-2">
            {changes.map(change => (
              <div key={change.id} className="p-3 bg-yellow-950/20 border border-yellow-900/30 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={change.alert_level === 'high' ? 'red' : 'yellow'}>{change.alert_level}</Badge>
                  <span className="text-sm font-medium text-gray-200">{change.sites?.name} — {change.field_changed}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-red-400"><strong>Antes:</strong> {change.before_value ?? '(vacío)'}</div>
                  <div className="text-green-400"><strong>Ahora:</strong> {change.after_value ?? '(vacío)'}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tabla comparativa */}
      <Card>
        <CardTitle>Title & Meta Description</CardTitle>
        <div className="space-y-4">
          {allSeo.length === 0 ? (
            <p className="text-gray-500 text-sm">Sin datos para hoy.</p>
          ) : (
            [...allSeo]
              .sort((a, b) => (b.sites?.is_own_brand ? 1 : 0) - (a.sites?.is_own_brand ? 1 : 0))
              .map(seo => (
                <div key={seo.id} className={`border rounded-lg p-4 ${seo.sites?.is_own_brand ? 'border-brand-500/30 bg-orange-950/10' : 'border-gray-800'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`font-semibold text-sm ${seo.sites?.is_own_brand ? 'text-brand-500' : 'text-gray-200'}`}>
                      {seo.sites?.name ?? '?'}
                    </span>
                    {seo.sites?.is_own_brand && <Badge variant="orange">Nosotros</Badge>}
                    <Badge variant={seo.is_indexable ? 'green' : 'red'}>
                      {seo.is_indexable ? 'Indexable' : 'No indexable'}
                    </Badge>
                    {seo.has_schema && <Badge variant="blue">Schema</Badge>}
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-gray-500">Title: </span>
                      <span className="text-gray-300">{seo.title ?? '—'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Meta: </span>
                      <span className="text-gray-400">{seo.meta_description ?? '—'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">H1: </span>
                      <span className="text-gray-300">{seo.h1 ?? '—'}</span>
                    </div>
                    {(seo.h2s ?? []).length > 0 && (
                      <div>
                        <span className="text-gray-500">H2s: </span>
                        <span className="text-gray-400">{(seo.h2s ?? []).slice(0, 3).join(' · ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
          )}
        </div>
      </Card>
    </div>
  )
}
