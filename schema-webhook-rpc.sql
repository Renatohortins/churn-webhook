-- RPC para buscar empresas sem venda paga nos últimos N dias
-- Execute no SQL Editor do Supabase

CREATE OR REPLACE FUNCTION get_inactive_companies(cutoff_date TIMESTAMPTZ)
RETURNS TABLE(company_id INTEGER) AS $$
  SELECT DISTINCT t.company_id
  FROM transactions t
  WHERE t.company_id IS NOT NULL
    AND t.company_id NOT IN (
      SELECT DISTINCT t2.company_id
      FROM transactions t2
      WHERE t2.status = 'paid'
        AND t2.paid_at >= cutoff_date
        AND t2.company_id IS NOT NULL
    )
$$ LANGUAGE sql STABLE;
