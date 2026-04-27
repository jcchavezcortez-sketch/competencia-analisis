import { createClient } from '@/lib/supabase/server'
import { Card, CardTitle } from '@/components/ui/card'
import { todayPE, formatDate } from '@/lib/utils'
import type { Screenshot, Site } from '@competencia/shared'
import Image from 'next/image'

export const revalidate = 3600

export default async function ScreenshotsPage({
  searchParams,
}: {
  searchParams: { date?: string; site?: string }
}) {
  const db = createClient()
  const date = searchParams.date ?? todayPE()

  let query = db
    .from('screenshots')
    .select('*, sites(name,slug,is_own_brand)')
    .eq('snapshot_date', date)
    .order('page_type')

  if (searchParams.site) query = query.eq('sites.slug', searchParams.site)

  const { data } = await query
  const screenshots = (data ?? []) as (Screenshot & { sites: Site })[]

  // Agrupar por sitio
  const bySite = new Map<string, { site: Site; shots: Screenshot[] }>()
  for (const ss of screenshots) {
    if (!ss.sites) continue
    const key = ss.sites.slug
    if (!bySite.has(key)) bySite.set(key, { site: ss.sites, shots: [] })
    bySite.get(key)!.shots.push(ss)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Screenshots</h1>
          <p className="text-gray-400 text-sm mt-1">{formatDate(date)}</p>
        </div>
        <input
          type="date"
          defaultValue={date}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300"
          onChange={e => {
            const url = new URL(window.location.href)
            url.searchParams.set('date', e.target.value)
            window.location.href = url.toString()
          }}
        />
      </div>

      {bySite.size === 0 ? (
        <Card>
          <p className="text-gray-500 text-center py-8">
            Sin screenshots para esta fecha. Los screenshots se toman durante el scraping diario.
          </p>
        </Card>
      ) : (
        Array.from(bySite.values()).map(({ site, shots }) => (
          <Card key={site.slug}>
            <CardTitle>
              <span className={site.is_own_brand ? 'text-brand-500' : ''}>
                {site.is_own_brand ? '★ ' : ''}{site.name}
              </span>
            </CardTitle>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {shots.map(ss => (
                <a
                  key={ss.id}
                  href={ss.public_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-lg overflow-hidden border border-gray-800 hover:border-gray-500 transition-colors"
                >
                  <div className="relative aspect-video bg-gray-800">
                    <Image
                      src={ss.public_url}
                      alt={`${site.name} - ${ss.page_type}`}
                      fill
                      className="object-cover object-top group-hover:scale-105 transition-transform duration-200"
                    />
                  </div>
                  <div className="px-2 py-1.5 flex items-center justify-between">
                    <span className="text-xs text-gray-400 capitalize">{ss.page_type}</span>
                    {ss.file_size_kb && (
                      <span className="text-xs text-gray-600">{ss.file_size_kb}KB</span>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
