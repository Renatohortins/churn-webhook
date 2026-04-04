import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { saveBatch } from './save-batch'

// ── Config ──────────────────────────────────────────────────
const envPath = resolve(process.cwd(), '.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => l.split('=').map(p => p.trim()) as [string, string])
)

const SUPABASE_URL         = env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY
const BESTFY_BASE_URL      = 'https://api.bestfybr.com.br/v1/admin/transactions'
const LIMIT                = 500  // transações por requisição
const DELAY_MS             = 600  // 0.6s entre requisições

// ── Supabase Client ─────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ── Helpers ─────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

function log(msg: string) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
  console.log(`[${ts}] ${msg}`)
}

// ── Busca a chave da API no banco ───────────────────────────
async function getApiKey(): Promise<string> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('key')
    .eq('gateway', 'bestfy')
    .eq('active', true)
    .order('id', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    throw new Error(
      'Chave da Bestfy não encontrada no banco.\n' +
      "Insira com: INSERT INTO api_keys (name, key, gateway) VALUES ('Bestfy', 'SUA_CHAVE', 'bestfy');"
    )
  }

  return data.key
}

// ── Busca transações na API usando cursor fromId ─────────────
// A API retorna em ordem decrescente de ID (mais novo primeiro).
// fromId = último ID recebido → a próxima página traz IDs menores (mais antigos).
async function fetchPage(apiKey: string, fromId: number | null): Promise<any[]> {
  const params = new URLSearchParams({ limit: String(LIMIT) })
  if (fromId !== null) params.set('fromId', String(fromId))

  const url = `${BESTFY_BASE_URL}?${params}`
  const credentials = Buffer.from(`${apiKey}:x`).toString('base64')

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API ${res.status}: ${body}`)
  }

  const data = await res.json()
  return Array.isArray(data) ? data : data.data ?? []
}

// ── Controle de progresso ────────────────────────────────────
// Sempre retoma do ponto mais avançado: menor last_transaction_id
// (IDs decrescem conforme avançamos no histórico)
async function getOrCreateProgress() {
  const { data: entries } = await supabase
    .from('sync_progress')
    .select('*')
    .not('last_transaction_id', 'is', null)
    .order('last_transaction_id', { ascending: true })
    .limit(1)

  if (entries && entries.length > 0) {
    const best = entries[0]

    // Garante que está como running para o próximo run reconhecer
    await supabase
      .from('sync_progress')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', best.id)

    log(`Retomando do ponto mais avançado — fromId: ${best.last_transaction_id} (${best.total_synced.toLocaleString()} já sincronizados)`)
    return { ...best, status: 'running' }
  }

  const { data: created } = await supabase
    .from('sync_progress')
    .insert({ status: 'running', started_at: new Date().toISOString() })
    .select()
    .single()

  log('Iniciando novo sync do começo')
  return created!
}

async function updateProgress(id: number, total: number, lastId: number | null) {
  await supabase.from('sync_progress').update({
    total_synced:        total,
    last_transaction_id: lastId,
    updated_at:          new Date().toISOString(),
  }).eq('id', id)
}

// ── Sync principal ───────────────────────────────────────────
async function run() {
  log('Iniciando sync de transações Bestfy → Supabase')

  const apiKey   = await getApiKey()
  const progress = await getOrCreateProgress()

  // cursor: ID da última transação recebida (null = primeira página)
  let fromId: number | null = progress.last_transaction_id ?? null
  let totalSynced           = progress.total_synced ?? 0
  let hasMore               = true

  const startTime      = Date.now()
  const estimatedTotal = 3_000_000

  // Pré-carrega a primeira página
  let nextPagePromise = fetchPage(apiKey, fromId)

  while (hasMore) {
    try {
      // Aguarda o fetch atual (já estava rodando em paralelo com o save anterior)
      const [page] = await Promise.all([
        nextPagePromise,
        sleep(DELAY_MS), // garante o intervalo mínimo de 600ms
      ])

      if (!page.length) {
        hasMore = false
        break
      }

      // Inicia o fetch da próxima página enquanto salva a atual
      const nextFromId = page.at(-1).id
      nextPagePromise = fetchPage(apiKey, nextFromId)

      await saveBatch(supabase, page)

      totalSynced += page.length
      fromId = nextFromId

      await updateProgress(progress.id, totalSynced, fromId)

      // ETA
      const elapsed   = (Date.now() - startTime) / 1000
      const rate      = totalSynced / elapsed
      const remaining = Math.max(0, estimatedTotal - totalSynced)
      const etaHours  = rate > 0 ? (remaining / rate / 3600).toFixed(1) : '?'

      log(`Sincronizados: ${totalSynced.toLocaleString()} | fromId: ${fromId} | ETA: ~${etaHours}h`)

      if (page.length < LIMIT) {
        hasMore = false
        break
      }
    } catch (err: any) {
      log(`ERRO: ${err.message}`)
      // Mantém status 'running' para que o próximo run retome do cursor salvo
      await supabase.from('sync_progress').update({
        error_message: err.message,
        updated_at:    new Date().toISOString(),
      }).eq('id', progress.id)
      process.exit(1)
    }
  }

  await supabase.from('sync_progress').update({
    status:       'completed',
    completed_at: new Date().toISOString(),
    updated_at:   new Date().toISOString(),
  }).eq('id', progress.id)

  log(`Sync concluído! Total sincronizado: ${totalSynced.toLocaleString()} transações`)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
