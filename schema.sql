-- ============================================================
-- SCHEMA: Cash - Bestfy Transaction Sync
-- Execute no SQL Editor do Supabase
-- ============================================================

-- Chaves de API dos gateways
CREATE TABLE IF NOT EXISTS api_keys (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  key       TEXT NOT NULL,
  gateway   TEXT NOT NULL DEFAULT 'bestfy',
  active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Controle de progresso do sync
CREATE TABLE IF NOT EXISTS sync_progress (
  id                   SERIAL PRIMARY KEY,
  status               TEXT NOT NULL DEFAULT 'idle', -- idle | running | completed | failed
  current_offset       INTEGER NOT NULL DEFAULT 0,
  total_synced         INTEGER NOT NULL DEFAULT 0,
  last_transaction_id  BIGINT,
  error_message        TEXT,
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela principal de transações
CREATE TABLE IF NOT EXISTS transactions (
  -- Identificadores
  id                   BIGINT PRIMARY KEY,
  external_id          TEXT,
  secure_id            TEXT,
  secure_url           TEXT,
  external_ref         TEXT,
  authorization_code   TEXT,

  -- Adquirente / Processador
  acquirer_type        TEXT,
  acquirer_status      TEXT,
  tenant_id            INTEGER,
  tenant_acquirer_id   INTEGER,
  company_id           INTEGER,

  -- Valores (em centavos)
  amount               INTEGER NOT NULL DEFAULT 0,
  paid_amount          INTEGER NOT NULL DEFAULT 0,
  refunded_amount      INTEGER NOT NULL DEFAULT 0,
  base_price           INTEGER,
  interest_rate        NUMERIC,
  installments         INTEGER DEFAULT 1,

  -- Pagamento
  payment_method       TEXT,  -- pix | credit_card | boleto
  status               TEXT,  -- paid | waiting_payment | refused | refunded

  -- Taxas
  fee_fixed_amount     INTEGER,
  fee_spread_pct       NUMERIC,
  fee_estimated        INTEGER,
  fee_net_amount       INTEGER,

  -- Datas
  created_at           TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ,
  paid_at              TIMESTAMPTZ,

  -- Referências
  customer_id          INTEGER,
  card_id              INTEGER,
  subscription_id      INTEGER,
  billing_id           INTEGER,
  checkout_id          INTEGER,

  -- Dados do cliente (desnormalizados para consulta rápida)
  customer_name        TEXT,
  customer_email       TEXT,
  customer_phone       TEXT,
  customer_document    TEXT,
  customer_doc_type    TEXT,
  customer_address     JSONB,

  -- Cartão
  card_brand           TEXT,
  card_holder          TEXT,
  card_first_digits    TEXT,
  card_last_digits     TEXT,
  card_exp_month       INTEGER,
  card_exp_year        INTEGER,

  -- PIX
  pix_qrcode           TEXT,
  pix_expiration       DATE,
  pix_end2end_id       TEXT,

  -- Entrega
  delivery_status      TEXT,
  delivery_tracking    TEXT,

  -- Campos JSONB para dados variados
  refused_reason       JSONB,
  antifraud            JSONB,
  informations         JSONB,

  -- Flags
  traceable            BOOLEAN DEFAULT FALSE,
  postback_url         TEXT,
  ip                   TEXT,

  -- Dados brutos (para consultas avançadas)
  raw_data             JSONB,
  synced_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Itens de cada transação
CREATE TABLE IF NOT EXISTS transaction_items (
  id             SERIAL PRIMARY KEY,
  transaction_id BIGINT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  external_ref   TEXT,
  title          TEXT,
  unit_price     INTEGER,
  quantity       INTEGER,
  tangible       BOOLEAN
);

-- Splits de cada transação
CREATE TABLE IF NOT EXISTS transaction_splits (
  id                    SERIAL PRIMARY KEY,
  transaction_id        BIGINT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  recipient_id          INTEGER,
  amount                INTEGER,
  net_amount            INTEGER,
  charge_processing_fee BOOLEAN
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tx_status         ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_tx_payment_method ON transactions(payment_method);
CREATE INDEX IF NOT EXISTS idx_tx_created_at     ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_paid_at        ON transactions(paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_company_id     ON transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_tx_customer_email ON transactions(customer_email);
CREATE INDEX IF NOT EXISTS idx_tx_customer_doc   ON transactions(customer_document);
CREATE INDEX IF NOT EXISTS idx_tx_items          ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tx_splits         ON transaction_splits(transaction_id);
