import { cn } from '@/lib/utils'

type Variant = 'default' | 'red' | 'yellow' | 'green' | 'blue' | 'orange'

const VARIANTS: Record<Variant, string> = {
  default: 'bg-gray-800 text-gray-300',
  red: 'bg-red-900/50 text-red-400 border border-red-800',
  yellow: 'bg-yellow-900/50 text-yellow-400 border border-yellow-800',
  green: 'bg-green-900/50 text-green-400 border border-green-800',
  blue: 'bg-blue-900/50 text-blue-400 border border-blue-800',
  orange: 'bg-orange-900/50 text-orange-400 border border-orange-800',
}

export function Badge({
  variant = 'default',
  className,
  children,
}: {
  variant?: Variant
  className?: string
  children: React.ReactNode
}) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
      VARIANTS[variant],
      className
    )}>
      {children}
    </span>
  )
}
