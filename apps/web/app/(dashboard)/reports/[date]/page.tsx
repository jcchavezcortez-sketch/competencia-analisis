import { createClient } from '@/lib/supabase/server'
import { Card, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { DailyReport, AggressivenessEntry } from '@competencia/shared'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const revalidate = 300

export default async function ReportDetailPage({ params }: { params: { date: string } }) {
  const db = createClient()

  const { data } = await db
    .from('daily_reports')
    .select('*')
    .eq('report_date', params.date)
    .maybeSingle()

  if (!data) notFound()
  const report = data as DailyReport
  const ranking = (report.aggressiveness_ranking ?? []) as AggressivenessEntry[]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/reports" className="text-gray-500 hover:text-gray-300 text-sm">← Reportes</Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Reporte {formatDate(report.report_date)}</h1>
        </div>
      </div>

      {report.executive_summary && (
        <Card>
          <CardTitle>Resumen Ejecutivo</CardTitle>
          <p className="text-gray-300 text-sm leading-relaxed">{report.executive_summary}</p>
        </Card>
      )}

      {ranking.length > 0 && (
        <Card>
          <CardTitle>Ranking Agresividad Promocional</CardTitle>
          <div className="space-y-3">
            {ranking.map((entry, i) => (
              <Link key={entry.site_slug} href={`/competitors/${entry.site_slug}`}>
                <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-800 transition-colors">
                  <span className="text-xl font-bold text-gray-600 w-8">{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-200">{entry.site_name}</span>
                      {entry.site_slug === 'teapuesto' && <Badge variant="orange">Nosotros</Badge>}
                    </div>
                    {entry.highlight && <div className="text-xs text-gray-500 mt-0.5">{entry.highlight}</div>}
                  </div>
                  <div className="text-right">
                    {entry.max_bonus && (
                      <div className="text-sm font-bold text-green-400">S/{entry.max_bonus}</div>
                    )}
                    <div className="text-xs text-gray-500">{entry.promo_count} promos · score {entry.score}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {report.conclusions && (
        <Card>
          <CardTitle>Conclusiones</CardTitle>
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{report.conclusions}</p>
        </Card>
      )}

      {report.recommendations && (
        <Card>
          <CardTitle>Recomendaciones</CardTitle>
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{report.recommendations}</p>
        </Card>
      )}

      {(report.new_promos as unknown[])?.length > 0 && (
        <Card>
          <CardTitle>Cambios de Promociones</CardTitle>
          <div className="space-y-2">
            {(report.new_promos as { siteName: string; type: string; level: string; summary: string }[]).map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded bg-gray-800/50 text-sm">
                <Badge variant={p.level === 'high' ? 'red' : p.level === 'medium' ? 'yellow' : 'blue'}>
                  {p.level}
                </Badge>
                <span className="text-gray-300">{p.summary}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
