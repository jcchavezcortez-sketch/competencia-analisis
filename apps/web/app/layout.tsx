import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TeApuesto Intelligence',
  description: 'Dashboard de inteligencia competitiva para TeApuesto.pe',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body>{children}</body>
    </html>
  )
}
