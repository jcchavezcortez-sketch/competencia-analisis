import { createClient } from '@/lib/supabase/server'
import { Card, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { DailyReport, AggressivenessEntry } from '@competencia/shared'
import Link from 'next/link'

export const revalidate = 300

export default async function ReportsPage() {
  const db = createClient()

  const { data } = await db
    .from('daily_reports')
    .select('*')
    .order('report_date', { ascending: false })
    .limit(30)

  const reports = (data ?? []) as DailyReport[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Reportes Diarios</h1>
        <p className="text-gray-400 text-sm mt-1">Últimos 30 reportes</p>
      </div>

      {reports.length === 0 ? (
        <Card>
          <p className="text-gray-500 text-center py-8">
            Aún no hay reportes generados. El primer reporte se crea al completar el scraping diario.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.map(report => {
            const ranking = (report.aggressiveness_ranking ?? []) as AggressivenessEntry[]
            const leader = ranking[0]

            return (
              <Card key={report.id} className="hover:border-gray-700 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="font-semibold text-gray-100">{formatDate(report.report_date)}</h2>
                      {leader && (
                        <Badge variant="orange">
                          Líder: {leader.site_name} (S/{leader.max_bonus ?? '?'})
                        </Badge>
                      )}
                    </div>
                    {report.executive_summary && (
                      <p className="text-sm text-gray-400 line-clamp-2">{report.executive_summary}</p>
                    )}
                  </div>
                  <Link
                    href={`/reports/${report.report_date}`}
                    className="shrink-0 text-xs text-brand-500 hover:underline"
                  >
                    Ver completo →
                  </Link>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
