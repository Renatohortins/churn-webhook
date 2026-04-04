import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Config ──────────────────────────────────────────────────
const envPath = resolve(process.cwd(), '.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => l.split('=').map(p => p.trim()) as [string, string])
)

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)

const DAYS_THRESHOLD = 3
const PAGE_SIZE = 1000
const triggeredBy = process.argv[2] === '--manual' ? 'manual' : 'cron'

function log(msg: string) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
  console.log(`[${ts}] ${msg}`)
}

interface InactiveCompany {
  company_id: number
  last_paid_at: string | null
}

// ── Busca TODAS as empresas inativas paginando de 1000 em 1000 ──
async function getInactiveCompanies(): Promise<InactiveCompany[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - DAYS_THRESHOLD)
  const cutoffISO = cutoff.toISOString()

  const all: InactiveCompany[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .rpc('get_inactive_companies', { cutoff_date: cutoffISO })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`RPC error: ${error.message}`)
    if (!data?.length) break

    all.push(...data.map((r: any) => ({
      company_id: r.company_id,
      last_paid_at: r.last_paid_at,
    })))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return all
}

// ── Busca URLs cadastradas ──────────────────────────────────
async function getWebhookUrls(): Promise<{ id: number; url: string }[]> {
  const { data, error } = await supabase
    .from('webhook_urls')
    .select('id, url')
    .eq('active', true)

  if (error) throw new Error(`Erro ao buscar URLs: ${error.message}`)
  return data ?? []
}

// ── Main ────────────────────────────────────────────────────
async function run() {
  log(`Webhook checker iniciado (modo: ${triggeredBy})`)

  const urls = await getWebhookUrls()
  if (!urls.length) {
    log('Nenhuma URL de webhook cadastrada. Cadastre em webhook_urls.')
    return
  }

  log(`${urls.length} URL(s) de webhook cadastrada(s)`)

  const inactiveCompanies = await getInactiveCompanies()
  log(`${inactiveCompanies.length} empresa(s) sem venda paga nos últimos ${DAYS_THRESHOLD} dias`)

  if (!inactiveCompanies.length) {
    log('Nenhuma empresa inativa. Nada a disparar.')
    return
  }

  let sent = 0
  let failed = 0
  const totalBatches = Math.ceil(inactiveCompanies.length / PAGE_SIZE)

  for (let i = 0; i < inactiveCompanies.length; i += PAGE_SIZE) {
    const chunk = inactiveCompanies.slice(i, i + PAGE_SIZE)
    const batchNum = Math.floor(i / PAGE_SIZE) + 1

    const payload = {
      event: 'companies.inactive',
      companies: chunk,
      total: inactiveCompanies.length,
      batch: batchNum,
      batch_size: chunk.length,
      days_without_sale: DAYS_THRESHOLD,
      triggered_at: new Date().toISOString(),
      triggered_by: triggeredBy,
    }

    log(`Enviando lote ${batchNum}/${totalBatches} (${chunk.length} empresas)`)

    for (const { url } of urls) {
      let statusCode = 0
      let response = ''
      let success = false

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        })
        statusCode = res.status
        response = (await res.text()).slice(0, 500)
        success = res.ok
      } catch (err: any) {
        response = err.message
      }

      await supabase.from('webhook_logs').insert({
        company_id: 0,
        webhook_url: url,
        payload,
        status_code: statusCode,
        response,
        success,
        triggered_by: triggeredBy,
      })

      if (success) sent++
      else failed++
    }
  }

  log(`Concluído! Lotes: ${totalBatches} | Enviados: ${sent} | Falhas: ${failed}`)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
