'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Users, Tag, Gauge,
  Bell, FileText, Menu, X,
} from 'lucide-react'
import { useState } from 'react'

const NAV = [
  { href: '/', label: 'Resumen', icon: LayoutDashboard },
  { href: '/competitors', label: 'Competidores', icon: Users },
  { href: '/promotions', label: 'Bonos de Bienvenida', icon: Tag },
  { href: '/pagespeed', label: 'PageSpeed', icon: Gauge },
  { href: '/alerts', label: 'Alertas', icon: Bell },
  { href: '/reports', label: 'Reportes', icon: FileText },
]

export function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-gray-800 text-gray-300"
      >
        <Menu size={20} />
      </button>

      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      <aside className={cn(
        'fixed top-0 left-0 h-full w-64 bg-gray-900 border-r border-gray-800 z-40 flex flex-col',
        'transition-transform duration-200',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        <div className="flex items-center justify-between px-5 py-5 border-b border-gray-800">
          <div>
            <div className="text-brand-500 font-bold text-lg leading-none">TeApuesto</div>
            <div className="text-gray-400 text-xs mt-0.5">Intelligence</div>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden text-gray-500">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors',
                  active
                    ? 'bg-brand-500/20 text-brand-500'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="px-5 py-4 border-t border-gray-800">
          <div className="text-xs text-gray-500">TeApuesto.pe</div>
          <div className="text-xs text-gray-600 mt-0.5">Actualización diaria 06:00 AM</div>
        </div>
      </aside>
    </>
  )
}
