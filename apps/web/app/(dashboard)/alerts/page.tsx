import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, alertLevelLabel, alertLevelColor } from '@/lib/utils'
import type { Alert, Site } from '@competencia/shared'

export const revalidate = 0

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: { level?: string; source?: string; page?: string }
}) {
  const db = createClient()
  const level = searchParams.level
  const source = searchParams.source
  const page = parseInt(searchParams.page ?? '1')
  const perPage = 30
  const from = (page - 1) * perPage

  let query = db
    .from('alerts')
    .select('*, sites(name,slug)', { count: 'exact' })
    .eq('is_false_positive', false)
    .order('created_at', { ascending: false })
    .range(from, from + perPage - 1)

  if (level) query = query.eq('alert_level', level)
  if (source) query = query.eq('source_type', source)

  const { data, count } = await query
  const alerts = (data ?? []) as (Alert & { sites: Site })[]
  const totalPages = Math.ceil((count ?? 0) / perPage)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Alertas</h1>
        <p className="text-gray-400 text-sm mt-1">{count ?? 0} alertas en total</p>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {[
          { href: '/alerts', label: 'Todas' },
          { href: '/alerts?level=high', label: '🔴 Alta' },
          { href: '/alerts?level=medium', label: '🟡 Media' },
          { href: '/alerts?level=low', label: '🔵 Baja' },
          { href: '/alerts?source=promotion', label: 'Promos' },
          { href: '/alerts?source=seo', label: 'SEO' },
          { href: '/alerts?source=pagespeed', label: 'PageSpeed' },
        ].map(f => (
          <a
            key={f.href}
            href={f.href}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
          >
            {f.label}
          </a>
        ))}
      </div>

      {/* Lista */}
      {alerts.length === 0 ? (
        <Card>
          <p className="text-gray-500 text-center py-8">Sin alertas con estos filtros.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`border rounded-xl p-4 ${alertLevelColor(alert.alert_level)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant={alert.alert_level === 'high' ? 'red' : alert.alert_level === 'medium' ? 'yellow' : 'blue'}>
                      {alertLevelLabel(alert.alert_level)}
                    </Badge>
                    <Badge variant="default">{alert.source_type}</Badge>
                    <span className="text-xs text-gray-500">{alert.sites?.name}</span>
                  </div>
                  <h3 className="font-medium text-sm">{alert.title}</h3>
                  {alert.description && (
                    <p className="text-xs opacity-80 mt-1">{alert.description}</p>
                  )}

                  {/* Diff antes/después */}
                  {(alert.before_data || alert.after_data) && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {alert.before_data && (
                        <div className="bg-red-950/30 border border-red-900/50 rounded p-2">
                          <div className="text-xs text-red-400 font-medium mb-1">Antes</div>
                          <pre className="text-xs text-gray-300 overflow-auto">
                            {JSON.stringify(alert.before_data, null, 2)}
                          </pre>
                        </div>
                      )}
                      {alert.after_data && (
                        <div className="bg-green-950/30 border border-green-900/50 rounded p-2">
                          <div className="text-xs text-green-400 font-medium mb-1">Después</div>
                          <pre className="text-xs text-gray-300 overflow-auto">
                            {JSON.stringify(alert.after_data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {alert.conclusion && (
                    <div className="mt-3 p-3 bg-yellow-950/20 border border-yellow-900/30 rounded text-xs text-yellow-200">
                      <strong>Conclusión:</strong> {alert.conclusion}
                    </div>
                  )}
                </div>

                <div className="text-right text-xs text-gray-500 shrink-0">
                  <div>{formatDateTime(alert.created_at)}</div>
                  {alert.email_sent && <div className="text-green-500 mt-1">✉ Email enviado</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <a
              key={p}
              href={`/alerts?page=${p}${level ? `&level=${level}` : ''}${source ? `&source=${source}` : ''}`}
              className={`w-8 h-8 flex items-center justify-center rounded text-sm ${p === page ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
