-- ============================================================
-- SCHEMA: Webhook - Alertas de empresas sem vendas
-- Execute no SQL Editor do Supabase
-- ============================================================

-- URLs de destino dos webhooks
CREATE TABLE IF NOT EXISTS webhook_urls (
  id          SERIAL PRIMARY KEY,
  url         TEXT NOT NULL,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Log de disparos
CREATE TABLE IF NOT EXISTS webhook_logs (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL,
  webhook_url TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status_code INTEGER,
  response    TEXT,
  success     BOOLEAN NOT NULL DEFAULT FALSE,
  triggered_by TEXT NOT NULL DEFAULT 'cron', -- cron | manual
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_company  ON webhook_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created  ON webhook_logs(created_at DESC);
