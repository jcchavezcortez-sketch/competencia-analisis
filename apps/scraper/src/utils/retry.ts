import { logger } from './logger.js'

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 3,
  delayMs = 3000
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      logger.warn(`${label} — intento ${attempt}/${maxAttempts} fallido: ${(err as Error).message}`)
      if (attempt < maxAttempts) {
        await sleep(delayMs * attempt)
      }
    }
  }
  throw lastError
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function randomDelay(minMs = 2000, maxMs = 6000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs)) + minMs
  return sleep(ms)
}
