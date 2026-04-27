import { cn } from '@/lib/utils'

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('bg-gray-900 border border-gray-800 rounded-xl p-5', className)}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <h3 className={cn('text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4', className)}>
      {children}
    </h3>
  )
}
