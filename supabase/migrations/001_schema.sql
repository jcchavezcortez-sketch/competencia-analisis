-- ============================================================
-- TeApuesto — Dashboard de Inteligencia Competitiva
-- Migración inicial: esquema completo
-- ============================================================

-- Marcas monitoreadas
CREATE TABLE IF NOT EXISTS sites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  url           TEXT NOT NULL,
  logo_url      TEXT,
  is_own_brand  BOOLEAN NOT NULL DEFAULT false,
  pages         JSONB NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registro maestro diario por sitio
CREATE TABLE IF NOT EXISTS daily_snapshots (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id                  UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  snapshot_date            DATE NOT NULL,
  scraped_at               TIMESTAMPTZ,
  scrape_status            TEXT NOT NULL DEFAULT 'pending',
  scrape_duration_seconds  INT,
  error_log                TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, snapshot_date)
);

-- Promociones detectadas
CREATE TABLE IF NOT EXISTS promotions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id      UUID NOT NULL REFERENCES daily_snapshots(id) ON DELETE CASCADE,
  site_id          UUID NOT NULL REFERENCES sites(id),
  snapshot_date    DATE NOT NULL,
  promo_type       TEXT NOT NULL,
  title            TEXT,
  description      TEXT,
  bonus_pct        NUMERIC,
  max_bonus        NUMERIC,
  min_deposit      NUMERIC,
  currency         TEXT DEFAULT 'PEN',
  rollover         TEXT,
  validity         TEXT,
  promo_url        TEXT,
  raw_content      TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  is_false_positive BOOLEAN NOT NULL DEFAULT false,
  manually_edited  BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cambios de promociones vs día anterior
CREATE TABLE IF NOT EXISTS promotion_changes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         UUID NOT NULL REFERENCES sites(id),
  promo_type      TEXT NOT NULL,
  change_type     TEXT NOT NULL,
  before_data     JSONB,
  after_data      JSONB,
  change_summary  TEXT,
  change_date     DATE NOT NULL,
  alert_level     TEXT NOT NULL DEFAULT 'low',
  alert_sent      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SEO visible diario
CREATE TABLE IF NOT EXISTS seo_snapshots (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id              UUID NOT NULL REFERENCES daily_snapshots(id) ON DELETE CASCADE,
  site_id                  UUID NOT NULL REFERENCES sites(id),
  snapshot_date            DATE NOT NULL,
  url_checked              TEXT NOT NULL,
  title                    TEXT,
  meta_description         TEXT,
  h1                       TEXT,
  h2s                      JSONB DEFAULT '[]',
  canonical                TEXT,
  robots_meta              TEXT,
  has_schema               BOOLEAN DEFAULT false,
  schema_types             JSONB DEFAULT '[]',
  is_indexable             BOOLEAN DEFAULT true,
  sitemap_url              TEXT,
  robots_txt_accessible    BOOLEAN DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cambios SEO
CREATE TABLE IF NOT EXISTS seo_changes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        UUID NOT NULL REFERENCES sites(id),
  url_checked    TEXT,
  field_changed  TEXT NOT NULL,
  before_value   TEXT,
  after_value    TEXT,
  change_date    DATE NOT NULL,
  alert_level    TEXT NOT NULL DEFAULT 'low',
  alert_sent     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PageSpeed por device
CREATE TABLE IF NOT EXISTS pagespeed_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id     UUID NOT NULL REFERENCES daily_snapshots(id) ON DELETE CASCADE,
  site_id         UUID NOT NULL REFERENCES sites(id),
  snapshot_date   DATE NOT NULL,
  device          TEXT NOT NULL,
  url_checked     TEXT NOT NULL,
  performance     NUMERIC,
  seo             NUMERIC,
  accessibility   NUMERIC,
  best_practices  NUMERIC,
  lcp             NUMERIC,
  inp             NUMERIC,
  cls             NUMERIC,
  fcp             NUMERIC,
  speed_index     NUMERIC,
  tbt             NUMERIC,
  opportunities   JSONB DEFAULT '[]',
  diagnostics     JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Screenshots
CREATE TABLE IF NOT EXISTS screenshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id    UUID NOT NULL REFERENCES daily_snapshots(id) ON DELETE CASCADE,
  site_id        UUID NOT NULL REFERENCES sites(id),
  snapshot_date  DATE NOT NULL,
  page_type      TEXT NOT NULL,
  storage_path   TEXT NOT NULL,
  public_url     TEXT NOT NULL,
  file_size_kb   INT,
  width          INT,
  height         INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alertas
CREATE TABLE IF NOT EXISTS alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          UUID NOT NULL REFERENCES sites(id),
  source_type      TEXT NOT NULL,
  alert_level      TEXT NOT NULL DEFAULT 'low',
  title            TEXT NOT NULL,
  description      TEXT,
  before_data      JSONB,
  after_data       JSONB,
  url              TEXT,
  screenshot_id    UUID REFERENCES screenshots(id),
  email_sent       BOOLEAN NOT NULL DEFAULT false,
  email_sent_at    TIMESTAMPTZ,
  is_read          BOOLEAN NOT NULL DEFAULT false,
  is_false_positive BOOLEAN NOT NULL DEFAULT false,
  conclusion       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reportes diarios
CREATE TABLE IF NOT EXISTS daily_reports (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date             DATE NOT NULL UNIQUE,
  executive_summary       TEXT,
  promo_table             JSONB DEFAULT '{}',
  aggressiveness_ranking  JSONB DEFAULT '[]',
  pagespeed_comparison    JSONB DEFAULT '{}',
  seo_changes_summary     JSONB DEFAULT '{}',
  new_promos              JSONB DEFAULT '[]',
  removed_promos          JSONB DEFAULT '[]',
  conclusions             TEXT,
  recommendations         TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Logs de ejecución del scraper
CREATE TABLE IF NOT EXISTS scrape_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date       DATE NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ,
  status         TEXT DEFAULT 'running',
  sites_ok       INT DEFAULT 0,
  sites_failed   INT DEFAULT 0,
  total_promos   INT DEFAULT 0,
  total_changes  INT DEFAULT 0,
  alerts_sent    INT DEFAULT 0,
  steps_log      JSONB DEFAULT '[]',
  error_details  TEXT
);

-- ============================================================
-- Índices para queries frecuentes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_snapshots_date   ON daily_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_site   ON daily_snapshots(site_id);
CREATE INDEX IF NOT EXISTS idx_promos_date      ON promotions(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_promos_site      ON promotions(site_id);
CREATE INDEX IF NOT EXISTS idx_promos_type      ON promotions(promo_type);
CREATE INDEX IF NOT EXISTS idx_seo_date         ON seo_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_psi_date         ON pagespeed_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_psi_device       ON pagespeed_snapshots(device);
CREATE INDEX IF NOT EXISTS idx_alerts_level     ON alerts(alert_level);
CREATE INDEX IF NOT EXISTS idx_alerts_read      ON alerts(is_read);
CREATE INDEX IF NOT EXISTS idx_alerts_created   ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_screenshots_site ON screenshots(site_id, snapshot_date DESC);

-- ============================================================
-- Datos iniciales: sitios
-- ============================================================
INSERT INTO sites (name, slug, url, is_own_brand, pages) VALUES
  ('TeApuesto', 'teapuesto', 'https://teapuesto.pe', true,
   '{"home":"https://teapuesto.pe","promotions":"https://teapuesto.pe/promociones","casino":"https://teapuesto.pe/casino","sports":"https://teapuesto.pe/apuestas","register":"https://teapuesto.pe/registro","bonus":"https://teapuesto.pe/bono-bienvenida"}'::jsonb),

  ('Apuestatotal', 'apuestatotal', 'https://apuestatotal.com', false,
   '{"home":"https://apuestatotal.com","promotions":"https://apuestatotal.com/promociones","casino":"https://apuestatotal.com/casino","sports":"https://apuestatotal.com/deportes","register":"https://apuestatotal.com/registrate","bonus":"https://apuestatotal.com/bono-bienvenida"}'::jsonb),

  ('Betsson', 'betsson', 'https://betsson.pe', false,
   '{"home":"https://betsson.pe","promotions":"https://betsson.pe/es-pe/promotions","casino":"https://betsson.pe/es-pe/casino","sports":"https://betsson.pe/es-pe/sports","register":"https://betsson.pe/es-pe/registro","bonus":"https://betsson.pe/es-pe/promotions"}'::jsonb),

  ('Betano', 'betano', 'https://betano.pe', false,
   '{"home":"https://betano.pe","promotions":"https://betano.pe/es-pe/promotions","casino":"https://betano.pe/es-pe/casino","sports":"https://betano.pe/es-pe/sports","register":"https://betano.pe/es-pe/registration","bonus":"https://betano.pe/es-pe/promotions"}'::jsonb),

  ('Olimpo', 'olimpo', 'https://olimpo.bet', false,
   '{"home":"https://olimpo.bet","promotions":"https://olimpo.bet/promociones","casino":"https://olimpo.bet/casino","sports":"https://olimpo.bet/apuestas","register":"https://olimpo.bet/registro","bonus":"https://olimpo.bet/bono-bienvenida"}'::jsonb),

  ('Doradobet', 'doradobet', 'https://doradobet.com', false,
   '{"home":"https://doradobet.com","promotions":"https://doradobet.com/promociones","casino":"https://doradobet.com/casino","sports":"https://doradobet.com/apuestas","register":"https://doradobet.com/registro","bonus":"https://doradobet.com/bono-bienvenida"}'::jsonb),

  ('Inkabet', 'inkabet', 'https://inkabet.pe', false,
   '{"home":"https://inkabet.pe","promotions":"https://inkabet.pe/promociones","casino":"https://inkabet.pe/casino","sports":"https://inkabet.pe/apuestas-deportivas","register":"https://inkabet.pe/registro","bonus":"https://inkabet.pe/bono-bienvenida"}'::jsonb),

  ('Atlantic City', 'atlanticcity', 'https://atlanticcity.pe', false,
   '{"home":"https://atlanticcity.pe","promotions":"https://atlanticcity.pe/promotions","casino":"https://atlanticcity.pe/casino","sports":"https://atlanticcity.pe/sports","register":"https://atlanticcity.pe/registro","bonus":"https://atlanticcity.pe/bono-bienvenida"}'::jsonb)

ON CONFLICT (slug) DO NOTHING;
