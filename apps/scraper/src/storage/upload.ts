import { db } from '../db/client.js'
import { logger } from '../utils/logger.js'

const BUCKET = 'screenshots'

export async function uploadScreenshot(
  buffer: Buffer,
  path: string
): Promise<string> {
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: 'image/png',
    upsert: true,
  })
  if (error) throw new Error(`uploadScreenshot: ${error.message}`)

  const { data } = db.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export function buildScreenshotPath(
  slug: string,
  date: string,
  pageType: string
): string {
  return `${slug}/${date}/${pageType}.png`
}

export async function ensureBucketExists(): Promise<void> {
  const { data: buckets } = await db.storage.listBuckets()
  const exists = buckets?.some(b => b.name === BUCKET)
  if (!exists) {
    const { error } = await db.storage.createBucket(BUCKET, { public: true })
    if (error) {
      logger.warn(`No se pudo crear bucket '${BUCKET}': ${error.message}`)
    } else {
      logger.info(`Bucket '${BUCKET}' creado`)
    }
  }
}
