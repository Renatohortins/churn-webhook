-- Adicionar colunas para controlar ordem de disparo e delay entre webhooks
-- Execute no SQL Editor do Supabase

ALTER TABLE webhook_urls
  ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE webhook_urls
  ADD COLUMN delay_seconds INTEGER NOT NULL DEFAULT 0;

-- Reordenar existentes por ID para manter consistência
UPDATE webhook_urls
SET "order" = ROW_NUMBER() OVER (ORDER BY id ASC) - 1;

-- Criar índice para facilitar busca ordenada
CREATE INDEX IF NOT EXISTS idx_webhook_urls_order ON webhook_urls("order");
