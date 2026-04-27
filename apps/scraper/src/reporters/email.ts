import { Resend } from 'resend'
import type { AlertLevel } from '@competencia/shared'
import { logger } from '../utils/logger.js'

const resend = new Resend(process.env.RESEND_API_KEY)

const ALERT_TO = process.env.ALERT_EMAIL_TO ?? 'juan.chavez@latinka.com.pe'
const ALERT_FROM = process.env.ALERT_EMAIL_FROM ?? 'alertas@teapuesto.pe'

const LEVEL_EMOJI: Record<AlertLevel, string> = {
  high: '🔴',
  medium: '🟡',
  low: '🔵',
}

const LEVEL_LABEL: Record<AlertLevel, string> = {
  high: 'ALTO',
  medium: 'MEDIO',
  low: 'BAJO',
}

export interface AlertEmailPayload {
  siteName: string
  alertLevel: AlertLevel
  title: string
  description: string
  summary: string
  before: unknown
  after: unknown
  url?: string
  screenshotUrl?: string
  conclusion?: string
  dashboardUrl?: string
}

function buildAlertHtml(p: AlertEmailPayload): string {
  const emoji = LEVEL_EMOJI[p.alertLevel]
  const levelLabel = LEVEL_LABEL[p.alertLevel]
  const dashUrl = p.dashboardUrl ?? process.env.NEXTAUTH_URL ?? 'https://tu-dashboard.vercel.app'

  const beforeStr = p.before ? JSON.stringify(p.before, null, 2) : 'N/A'
  const afterStr = p.after ? JSON.stringify(p.after, null, 2) : 'N/A'

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 20px; color: #1a1a1a; }
  .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,.1); }
  .header { background: ${p.alertLevel === 'high' ? '#dc2626' : p.alertLevel === 'medium' ? '#d97706' : '#2563eb'}; color: white; padding: 20px 24px; }
  .header h1 { margin: 0; font-size: 18px; }
  .header p { margin: 6px 0 0; opacity: .85; font-size: 13px; }
  .body { padding: 24px; }
  .label { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
  .value { font-size: 14px; color: #111; margin-bottom: 16px; }
  .diff { display: flex; gap: 12px; margin-bottom: 20px; }
  .diff-box { flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; }
  .diff-box.before { border-color: #fca5a5; background: #fef2f2; }
  .diff-box.after  { border-color: #6ee7b7; background: #f0fdf4; }
  .diff-box code  { font-size: 12px; white-space: pre-wrap; display: block; }
  .conclusion { background: #fffbeb; border-left: 3px solid #f59e0b; padding: 14px; border-radius: 0 6px 6px 0; margin: 16px 0; font-size: 14px; }
  .btn { display: inline-block; background: #f97316; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 16px; }
  .footer { padding: 16px 24px; background: #f9fafb; font-size: 12px; color: #9ca3af; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${emoji} Alerta ${levelLabel} — TeApuesto Intelligence</h1>
    <p>${p.siteName} · ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}</p>
  </div>
  <div class="body">
    <div class="label">Cambio detectado</div>
    <div class="value" style="font-weight:600;font-size:16px">${p.title}</div>

    <div class="label">Descripción</div>
    <div class="value">${p.description}</div>

    ${p.url ? `<div class="label">URL</div><div class="value"><a href="${p.url}">${p.url}</a></div>` : ''}

    <div class="diff">
      <div class="diff-box before">
        <div class="label" style="color:#dc2626">Antes</div>
        <code>${beforeStr}</code>
      </div>
      <div class="diff-box after">
        <div class="label" style="color:#059669">Ahora</div>
        <code>${afterStr}</code>
      </div>
    </div>

    ${p.conclusion ? `<div class="conclusion"><strong>Conclusión accionable:</strong><br>${p.conclusion}</div>` : ''}

    ${p.screenshotUrl ? `<div class="label">Screenshot</div><img src="${p.screenshotUrl}" style="max-width:100%;border-radius:6px;margin-bottom:16px">` : ''}

    <a href="${dashUrl}/alerts" class="btn">Ver en Dashboard →</a>
  </div>
  <div class="footer">TeApuesto Intelligence Dashboard · Análisis automático diario</div>
</div>
</body>
</html>`
}

export async function sendAlertEmail(payload: AlertEmailPayload): Promise<boolean> {
  try {
    const levelLabel = LEVEL_LABEL[payload.alertLevel]
    const emoji = LEVEL_EMOJI[payload.alertLevel]

    const { error } = await resend.emails.send({
      from: ALERT_FROM,
      to: ALERT_TO,
      subject: `${emoji} [${levelLabel}] ${payload.siteName}: ${payload.title}`,
      html: buildAlertHtml(payload),
    })

    if (error) {
      logger.error(`Email send error: ${JSON.stringify(error)}`)
      return false
    }

    logger.info(`Email enviado: ${payload.title} → ${ALERT_TO}`)
    return true
  } catch (err) {
    logger.error(`sendAlertEmail exception: ${(err as Error).message}`)
    return false
  }
}

export async function sendDailyReportEmail(params: {
  date: string
  executiveSummary: string
  changesCount: number
  alertsCount: number
  newPromos: number
  dashboardUrl?: string
}): Promise<void> {
  const { date, executiveSummary, changesCount, alertsCount, newPromos, dashboardUrl } = params
  const dashUrl = dashboardUrl ?? process.env.NEXTAUTH_URL ?? 'https://tu-dashboard.vercel.app'

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8">
<style>
  body { font-family: -apple-system, sans-serif; background:#f5f5f5; padding:20px; color:#1a1a1a; }
  .container { max-width:600px; margin:0 auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,.1); }
  .header { background:#f97316; color:white; padding:20px 24px; }
  .header h1 { margin:0; font-size:18px; }
  .stats { display:flex; gap:12px; padding:20px 24px; background:#f9fafb; }
  .stat { flex:1; text-align:center; }
  .stat-num { font-size:28px; font-weight:700; color:#f97316; }
  .stat-label { font-size:12px; color:#6b7280; margin-top:4px; }
  .body { padding:24px; }
  .btn { display:inline-block; background:#f97316; color:white; text-decoration:none; padding:10px 20px; border-radius:6px; font-size:14px; font-weight:600; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>📊 Reporte Diario — ${date}</h1>
    <p>TeApuesto Intelligence · Análisis automático</p>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-num">${changesCount}</div><div class="stat-label">Cambios detectados</div></div>
    <div class="stat"><div class="stat-num">${newPromos}</div><div class="stat-label">Nuevas promos</div></div>
    <div class="stat"><div class="stat-num">${alertsCount}</div><div class="stat-label">Alertas generadas</div></div>
  </div>
  <div class="body">
    <h2 style="margin-top:0">Resumen del día</h2>
    <p>${executiveSummary}</p>
    <a href="${dashUrl}" class="btn">Ver reporte completo →</a>
  </div>
</div>
</body>
</html>`

  try {
    await resend.emails.send({
      from: ALERT_FROM,
      to: ALERT_TO,
      subject: `📊 Reporte Competencia ${date} — ${changesCount} cambios detectados`,
      html,
    })
    logger.info(`Reporte diario enviado a ${ALERT_TO}`)
  } catch (err) {
    logger.error(`sendDailyReportEmail error: ${(err as Error).message}`)
  }
}
