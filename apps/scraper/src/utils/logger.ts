import { createLogger, format, transports } from 'winston'

export const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) => {
      const base = `[${timestamp}] ${level.toUpperCase()}: ${message}`
      return stack ? `${base}\n${stack}` : base
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'logs/scrape.log', maxsize: 5_000_000, maxFiles: 7 }),
  ],
})
