# TeApuesto Intelligence Dashboard

Dashboard interno de inteligencia competitiva para **TeApuesto.pe**. Monitorea promociones, SEO, PageSpeed y cambios de la competencia en Perú de forma automática cada día.

## Competidores monitoreados

- Apuestatotal.com
- Betsson.pe
- Betano.pe
- Olimpo.bet
- Doradobet
- Inkabet
- Atlantic City

---

## Arquitectura

```
GitHub Actions (cron 06:00 AM PET)
        │
        ▼
apps/scraper (Node.js + Playwright)
        │ escribe
        ▼
Supabase (PostgreSQL + Storage)
        │ lee
        ▼
apps/web (Next.js en Vercel)
```

**Stack:**
- Scraper: Node.js + Playwright + Claude API (Haiku)
- Dashboard: Next.js 14 + Tailwind CSS
- Base de datos: Supabase (PostgreSQL)
- Storage screenshots: Supabase Storage
- Email alertas: Resend
- Cron: GitHub Actions
- Deploy web: Vercel (gratuito)

---

## Setup inicial

### 1. Clonar y configurar

```bash
git clone https://github.com/jcchavezcortez-sketch/competencia-analisis
cd competencia-analisis
pnpm install
```

### 2. Variables de entorno

Crear `apps/scraper/.env`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://dypuarddutrhsjtgydjd.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<tu_service_role_key>
ANTHROPIC_API_KEY=<tu_claude_key>
GOOGLE_PAGESPEED_API_KEY=<tu_pagespeed_key>
RESEND_API_KEY=<tu_resend_key>
ALERT_EMAIL_FROM=alertas@teapuesto.pe
ALERT_EMAIL_TO=juan.chavez@latinka.com.pe
NEXTAUTH_URL=https://tu-dominio.vercel.app
```

Crear `apps/web/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://dypuarddutrhsjtgydjd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu_anon_key>
```

### 3. Supabase — ejecutar migración

1. Ir a **Supabase Dashboard** → tu proyecto → **SQL Editor**
2. Pegar y ejecutar el contenido de `supabase/migrations/001_schema.sql`
3. Esto crea todas las tablas y los 8 sitios iniciales

### 4. Supabase Storage — crear bucket

En Supabase Dashboard → **Storage** → **New bucket**:
- Nombre: `screenshots`
- Tipo: **Public**

*(El scraper lo crea automáticamente si no existe, pero puedes hacerlo manualmente)*

### 5. Resend — verificar dominio

1. Ir a [resend.com](https://resend.com) → **Domains** → Add domain
2. Agregar `teapuesto.pe`
3. Configurar los DNS records indicados
4. Una vez verificado, puedes enviar desde `alertas@teapuesto.pe`

---

## Ejecutar el scraper manualmente

```bash
# Desde la raíz del monorepo
pnpm scrape
```

Esto ejecuta el pipeline completo:
1. Screenshots de todas las páginas
2. Extracción SEO
3. Extracción de promociones (via Claude Haiku)
4. PageSpeed Insights API
5. Análisis de cambios vs día anterior
6. Envío de alertas por email
7. Generación del reporte diario

**Duración estimada:** ~25-35 minutos para los 8 sitios.

### Instalar Playwright (primera vez)

```bash
pnpm install:playwright
```

---

## Deploy del dashboard

### Vercel (recomendado)

1. Ir a [vercel.com](https://vercel.com) → **New Project** → importar este repo
2. **Root Directory**: `apps/web`
3. **Framework**: Next.js
4. Agregar las variables de entorno:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Deploy

---

## GitHub Actions — Cron diario

El workflow `.github/workflows/daily-scrape.yml` se ejecuta automáticamente cada día a las **06:00 AM hora Perú** (11:00 UTC).

### Configurar secrets en GitHub

Ir al repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Valor |
|--------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `ANTHROPIC_API_KEY` | Claude API key |
| `GOOGLE_PAGESPEED_API_KEY` | PageSpeed API key |
| `RESEND_API_KEY` | Resend API key |
| `ALERT_EMAIL_FROM` | `alertas@teapuesto.pe` |
| `ALERT_EMAIL_TO` | `juan.chavez@latinka.com.pe` |
| `NEXTAUTH_URL` | URL del dashboard en Vercel |

### Ejecutar manualmente desde GitHub

Repo → **Actions** → **Daily Competitive Intelligence Scrape** → **Run workflow**

---

## Estructura de carpetas

```
competencia-analisis/
├── .github/workflows/daily-scrape.yml   # Cron diario
├── apps/
│   ├── scraper/                         # Node.js scraper
│   │   └── src/
│   │       ├── scrapers/                # Playwright scrapers
│   │       ├── analyzers/              # Diff + AI
│   │       ├── reporters/              # Email
│   │       ├── db/                     # Supabase queries
│   │       └── index.ts               # Entry point
│   └── web/                            # Next.js dashboard
│       └── app/
│           ├── (dashboard)/
│           │   ├── page.tsx            # Resumen diario
│           │   ├── competitors/        # Vista competidores
│           │   ├── promotions/         # Tabla comparativa
│           │   ├── seo/                # SEO visible
│           │   ├── pagespeed/          # PSI comparativo
│           │   ├── screenshots/        # Galería
│           │   ├── alerts/             # Alertas
│           │   └── reports/            # Reportes diarios
│           └── layout.tsx
├── packages/shared/                     # Tipos TypeScript compartidos
├── supabase/migrations/001_schema.sql   # Schema completo
└── .env.example                         # Template de variables
```

---

## Cómo agregar un nuevo competidor

1. Agregar el sitio en `supabase/migrations/001_schema.sql` (o directo en Supabase Dashboard)
2. El scraper lo detecta automáticamente en el siguiente run

---

## Notas de scraping

- El scraper usa **delays aleatorios** (2-10s) entre páginas para no sobrecargar los sitios
- **Playwright headless** con user-agents rotativos y headers realistas
- Si un sitio bloquea el scraping, el snapshot se marca como `partial` o `failed`
- Los logs quedan en `apps/scraper/logs/scrape.log` y en GitHub Actions Artifacts
- **Reintentos**: hasta 3 intentos por operación con backoff exponencial

---

## Costo mensual estimado

| Servicio | Costo |
|----------|-------|
| Supabase (DB + Storage) | $0 (free tier) |
| Vercel (dashboard) | $0 (free tier) |
| GitHub Actions (cron) | $0 (free tier) |
| Resend (alertas email) | $0 (free tier hasta 3k/mes) |
| Claude API (Haiku) | ~$1-3 |
| Google PageSpeed | $0 (gratis) |
| **Total** | **~$1-3/mes** |
