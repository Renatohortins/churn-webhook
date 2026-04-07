import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const PAGE_SIZE = 1000

interface InactiveCompany {
  company_id: number
  last_paid_at: string | null
}

interface ActiveCompanyToday {
  company_id: number
  total_paid_today: number
}

async function fetchAllInactive(): Promise<InactiveCompany[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 3)
  const cutoffISO = cutoff.toISOString()

  const all: InactiveCompany[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .rpc('get_inactive_companies', { cutoff_date: cutoffISO })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)
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

async function fetchActiveToday(): Promise<ActiveCompanyToday[]> {
  const all: ActiveCompanyToday[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .rpc('get_active_companies_today')
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)
    if (!data?.length) break

    all.push(...data.map((r: any) => ({
      company_id: r.company_id,
      total_paid_today: r.total_paid_today,
    })))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return all
}

// POST — dispara webhook de uma URL específica
export async function POST(
  req: NextRequest,
  context: any
) {
  const webhookId = parseInt(context.params.id)

  if (!webhookId) {
    return NextResponse.json({ error: 'ID do webhook inválido' }, { status: 400 })
  }

  // Busca a URL e seu tipo de evento
  const { data: webhook, error: webhookError } = await supabase
    .from('webhook_urls')
    .select('id, url, event_type')
    .eq('id', webhookId)
    .eq('active', true)
    .single()

  if (webhookError || !webhook) {
    return NextResponse.json(
      { error: 'URL de webhook não encontrada ou inativa' },
      { status: 404 }
    )
  }

  // Busca os dados do evento
  let companies: any[]
  let eventName: string

  try {
    if (webhook.event_type === 'empresa_inativa') {
      companies = await fetchAllInactive()
      eventName = 'companies.inactive'
    } else if (webhook.event_type === 'empresas_ativas_hoje') {
      companies = await fetchActiveToday()
      eventName = 'companies.active_today'
    } else {
      throw new Error(`Tipo de evento desconhecido: ${webhook.event_type}`)
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  let sent = 0
  let failed = 0
  const today = new Date().toISOString().split('T')[0]

  // Dispara para a URL específica em lotes
  for (let i = 0; i < companies.length; i += PAGE_SIZE) {
    const chunk = companies.slice(i, i + PAGE_SIZE)

    // Payload diferente para cada tipo de evento
    const payload =
      webhook.event_type === 'empresa_inativa'
        ? {
            event: eventName,
            companies: chunk,
            total: companies.length,
            batch: Math.floor(i / PAGE_SIZE) + 1,
            batch_size: chunk.length,
            triggered_at: new Date().toISOString(),
            triggered_by: 'manual',
          }
        : {
            event: eventName,
            companies: chunk,
            date: today,
            total: companies.length,
            batch: Math.floor(i / PAGE_SIZE) + 1,
            batch_size: chunk.length,
            triggered_at: new Date().toISOString(),
            triggered_by: 'manual',
          }

    let statusCode = 0
    let response = ''
    let success = false

    try {
      const res = await fetch(webhook.url, {
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

    // Registra em webhook_logs
    await supabase.from('webhook_logs').insert({
      company_id: 0,
      webhook_url: webhook.url,
      payload,
      status_code: statusCode,
      response,
      success,
      triggered_by: 'manual',
    })

    if (success) sent++
    else failed++
  }

  return NextResponse.json({
    webhook_url: webhook.url,
    event_type: webhook.event_type,
    companies: companies.length,
    batches: Math.ceil(companies.length / PAGE_SIZE),
    sent,
    failed,
    success: failed === 0,
  })
}
