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
const LIMIT                = 500
const DELAY_MS             = 600

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ── Helpers ─────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

function log(msg: string) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
  console.log(`[${ts}] ${msg}`)
}

// ── Busca chave da API ──────────────────────────────────────
async function getApiKey(): Promise<string> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('key')
    .eq('gateway', 'bestfy')
    .eq('active', true)
    .order('id', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) throw new Error('Chave Bestfy não encontrada no banco.')
  return data.key
}

// ── Busca a transação mais recente no banco ─────────────────
async function getNewestStoredId(): Promise<number> {
  const { data } = await supabase
    .from('transactions')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .single()

  if (!data) throw new Error('Banco vazio — rode npm run sync primeiro.')
  return data.id
}

// ── Fetch da API ────────────────────────────────────────────
async function fetchPage(apiKey: string, fromId?: number): Promise<any[]> {
  let url = `${BESTFY_BASE_URL}?limit=${LIMIT}`
  if (fromId) url += `&fromId=${fromId}`

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

// ── Catchup: busca transações novas ─────────────────────────
async function run() {
  const apiKey       = await getApiKey()
  const newestStored = await getNewestStoredId()

  log(`Transação mais recente no banco: ${newestStored}`)
  log(`Buscando transações novas da API...`)

  let fromId: number | undefined = undefined
  let totalNew = 0
  let done = false

  while (!done) {
    const page = await fetchPage(apiKey, fromId)

    if (!page.length) {
      done = true
      break
    }

    // Filtra só transações mais novas que o que já temos
    const newTxs = page.filter(tx => tx.id > newestStored)

    if (newTxs.length > 0) {
      await saveBatch(supabase, newTxs)
      totalNew += newTxs.length
    }

    log(`Página: ${page.length} tx | Novas: ${newTxs.length} | Total novas salvas: ${totalNew.toLocaleString()}`)

    // Se encontrou transações que já temos, chegamos na sobreposição
    if (newTxs.length < page.length) {
      log('Alcançou transações já existentes no banco — catchup concluído!')
      done = true
      break
    }

    // Cursor para próxima página (menor ID da página = mais antigo)
    fromId = page[page.length - 1].id

    await sleep(DELAY_MS)
  }

  log(`Catchup finalizado! ${totalNew.toLocaleString()} transações novas salvas.`)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
