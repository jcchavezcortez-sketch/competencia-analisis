import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { logger } from '../utils/logger.js'
import { randomDelay } from '../utils/retry.js'

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
]

export class ScraperBrowser {
  private browser: Browser | null = null
  private context: BrowserContext | null = null

  async launch(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    })

    this.context = await this.browser.newContext({
      userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
      viewport: { width: 1440, height: 900 },
      locale: 'es-PE',
      timezoneId: 'America/Lima',
      extraHTTPHeaders: {
        'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    })

    // Bloquear recursos innecesarios para acelerar
    await this.context.route('**/*.{woff,woff2,ttf,otf}', route => route.abort())
    logger.info('Browser lanzado')
  }

  async newPage(): Promise<Page> {
    if (!this.context) throw new Error('Browser no inicializado')
    return this.context.newPage()
  }

  async navigateSafe(page: Page, url: string, label: string): Promise<boolean> {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await randomDelay(1500, 3000)
      return true
    } catch (err) {
      logger.warn(`${label} — no cargó ${url}: ${(err as Error).message}`)
      return false
    }
  }

  async close(): Promise<void> {
    await this.context?.close()
    await this.browser?.close()
    logger.info('Browser cerrado')
  }
}
