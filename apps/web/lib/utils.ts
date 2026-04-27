import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima',
  })
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('es-PE', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima',
  })
}

export function todayPE(): string {
  return new Date().toLocaleDateString('sv', { timeZone: 'America/Lima' })
}

export function yesterdayPE(): string {
  return new Date(Date.now() - 86_400_000).toLocaleDateString('sv', { timeZone: 'America/Lima' })
}

export function scoreColor(score: number | null): string {
  if (score === null) return 'text-gray-400'
  if (score >= 90) return 'text-green-400'
  if (score >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

export function scoreBg(score: number | null): string {
  if (score === null) return 'bg-gray-700'
  if (score >= 90) return 'bg-green-900/50 border-green-700'
  if (score >= 50) return 'bg-yellow-900/50 border-yellow-700'
  return 'bg-red-900/50 border-red-700'
}

export function alertLevelColor(level: string): string {
  if (level === 'high') return 'bg-red-900/50 text-red-400 border-red-700'
  if (level === 'medium') return 'bg-yellow-900/50 text-yellow-400 border-yellow-700'
  return 'bg-blue-900/50 text-blue-400 border-blue-700'
}

export function alertLevelLabel(level: string): string {
  if (level === 'high') return '🔴 Alto'
  if (level === 'medium') return '🟡 Medio'
  return '🔵 Bajo'
}
