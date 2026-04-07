-- RPC para buscar empresas sem venda paga nos últimos N dias
-- Usa a tabela company_activity para performance (muito rápido)
-- Retorna company_id e último paid_at
-- Execute no SQL Editor do Supabase

CREATE OR REPLACE FUNCTION get_inactive_companies(cutoff_date TIMESTAMPTZ)
RETURNS TABLE(company_id INTEGER, last_paid_at TIMESTAMPTZ) AS $$
  SELECT
    company_id,
    last_paid_at
  FROM company_activity
  WHERE last_paid_at IS NULL
    OR last_paid_at < cutoff_date
$$ LANGUAGE sql STABLE;

-- RPC para buscar empresas que transacionaram (status = 'paid') no dia de hoje
-- Retorna company_id e quantidade de transações pagas hoje
-- Muito rápida pois filtra apenas um dia de dados

CREATE OR REPLACE FUNCTION get_active_companies_today()
RETURNS TABLE(company_id INTEGER, total_paid_today INTEGER) AS $$
  SELECT
    company_id,
    COUNT(*)::INTEGER as total_paid_today
  FROM transactions
  WHERE status = 'paid'
    AND paid_at >= CURRENT_DATE::TIMESTAMPTZ
    AND paid_at < (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ
    AND company_id IS NOT NULL
  GROUP BY company_id
$$ LANGUAGE sql STABLE;
