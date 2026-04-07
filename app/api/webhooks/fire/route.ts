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

// GET — chamado pelo Vercel Cron (a cada hora)
// Dispara webhooks agendados para esta hora (todos os tipos de evento)
// Respeita a ordem e aplica delay entre webhooks
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Hora atual UTC (ex: "14:00")
  const now = new Date()
  const currentHour = `${String(now.getUTCHours()).padStart(2, '0')}:00`

  // Busca todas as URLs agendadas para esta hora, ordenadas
  const { data: allUrls } = await supabase
    .from('webhook_urls')
    .select('id, url, event_type, schedule_time, "order", delay_seconds')
    .eq('active', true)
    .order('order', { ascending: true })

  const matchingUrls = (allUrls ?? []).filter(u => {
    const scheduled = (u.schedule_time as string)?.slice(0, 5)
    return scheduled === currentHour
  })

  if (!matchingUrls.length) {
    return NextResponse.json({ message: `Nenhum webhook agendado para ${currentHour} UTC`, skipped: true })
  }

  // Agrupa URLs por tipo de evento, mantendo ordem
  const urlsByType = matchingUrls.reduce((acc, u) => {
    if (!acc[u.event_type]) acc[u.event_type] = []
    acc[u.event_type].push({ id: u.id, url: u.url, delay_seconds: u.delay_seconds })
    return acc
  }, {} as Record<string, { id: number; url: string; delay_seconds: number }[]>)

  // Dispara cada tipo de evento para suas URLs (sequencialmente com delay)
  const results: any[] = []
  for (const [eventType, urls] of Object.entries(urlsByType)) {
    const result = await fireWebhooksWithQueue('cron', urls, eventType)
    results.push(result)
  }

  return NextResponse.json({
    message: `${results.length} tipo(s) de evento disparado(s)`,
    results,
  })
}

// POST — chamado pelo botão do frontend (dispara todos os tipos de evento para suas URLs)
// Respeita a ordem e aplica delay entre webhooks
export async function POST() {
  const { data: allUrls } = await supabase
    .from('webhook_urls')
    .select('id, url, event_type, "order", delay_seconds')
    .eq('active', true)
    .order('order', { ascending: true })

  if (!allUrls?.length) {
    return NextResponse.json({ error: 'Nenhuma URL de webhook cadastrada' }, { status: 400 })
  }

  // Agrupa URLs por tipo de evento, mantendo ordem
  const urlsByType = allUrls.reduce((acc, u) => {
    if (!acc[u.event_type]) acc[u.event_type] = []
    acc[u.event_type].push({ id: u.id, url: u.url, delay_seconds: u.delay_seconds })
    return acc
  }, {} as Record<string, { id: number; url: string; delay_seconds: number }[]>)

  // Dispara cada tipo de evento para suas URLs (sequencialmente com delay)
  const results: any[] = []
  for (const [eventType, urls] of Object.entries(urlsByType)) {
    const result = await fireWebhooksWithQueue('manual', urls, eventType)
    results.push(result)
  }

  return NextResponse.json({
    message: `${results.length} tipo(s) de evento disparado(s)`,
    results,
  })
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

async function fireWebhooksWithQueue(
  triggeredBy: string,
  urls: { id: number; url: string; delay_seconds: number }[],
  eventType: string
) {
  // Busca dados do evento UMA VEZ (não repetir para cada URL)
  let companies: any[]
  let eventName: string

  try {
    if (eventType === 'empresa_inativa') {
      companies = await fetchAllInactive()
      eventName = 'companies.inactive'
    } else if (eventType === 'empresas_ativas_hoje') {
      companies = await fetchActiveToday()
      eventName = 'companies.active_today'
    } else {
      throw new Error(`Tipo de evento desconhecido: ${eventType}`)
    }
  } catch (err: any) {
    return {
      event_type: eventType,
      error: err.message,
      success: false,
    }
  }

  const today = new Date().toISOString().split('T')[0]
  let totalSent = 0
  let totalFailed = 0

  // ===== FILA: Itera sobre cada URL na ordem configurada =====
  for (let urlIdx = 0; urlIdx < urls.length; urlIdx++) {
    const { url, delay_seconds } = urls[urlIdx]

    // ===== DELAY: Aguarda ANTES de disparar (delay de cada URL) =====
    if (urlIdx > 0 && delay_seconds > 0) {
      console.log(`[WEBHOOK QUEUE] Aguardando ${delay_seconds}s antes da próxima URL...`)
      await sleep(delay_seconds * 1000)
    }

    console.log(`[WEBHOOK QUEUE] Disparando URL ${urlIdx + 1}/${urls.length}: ${url}`)

    // Dispara TODOS os lotes para esta URL
    for (let i = 0; i < companies.length; i += PAGE_SIZE) {
      const chunk = companies.slice(i, i + PAGE_SIZE)

      const payload =
        eventType === 'empresa_inativa'
          ? {
              event: eventName,
              companies: chunk,
              total: companies.length,
              batch: Math.floor(i / PAGE_SIZE) + 1,
              batch_size: chunk.length,
              triggered_at: new Date().toISOString(),
              triggered_by: triggeredBy,
            }
          : {
              event: eventName,
              companies: chunk,
              date: today,
              total: companies.length,
              batch: Math.floor(i / PAGE_SIZE) + 1,
              batch_size: chunk.length,
              triggered_at: new Date().toISOString(),
              triggered_by: triggeredBy,
            }

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

      if (success) totalSent++
      else totalFailed++
    }
  }

  return {
    event_type: eventType,
    companies: companies.length,
    webhooks_sent: totalSent,
    webhooks_failed: totalFailed,
    success: totalFailed === 0,
  }
}

async function fireWebhooks(
  triggeredBy: string,
  urls: { id: number; url: string }[],
  eventType: string
) {
  let companies: any[]
  let eventName: string

  try {
    if (eventType === 'empresa_inativa') {
      companies = await fetchAllInactive()
      eventName = 'companies.inactive'
    } else if (eventType === 'empresas_ativas_hoje') {
      companies = await fetchActiveToday()
      eventName = 'companies.active_today'
    } else {
      throw new Error(`Tipo de evento desconhecido: ${eventType}`)
    }
  } catch (err: any) {
    return {
      event_type: eventType,
      error: err.message,
      success: false,
    }
  }

  let sent = 0
  let failed = 0
  const today = new Date().toISOString().split('T')[0]

  for (let i = 0; i < companies.length; i += PAGE_SIZE) {
    const chunk = companies.slice(i, i + PAGE_SIZE)

    // Payload diferente para cada tipo de evento
    const payload = eventType === 'empresa_inativa'
      ? {
          event: eventName,
          companies: chunk,
          total: companies.length,
          batch: Math.floor(i / PAGE_SIZE) + 1,
          batch_size: chunk.length,
          triggered_at: new Date().toISOString(),
          triggered_by: triggeredBy,
        }
      : {
          event: eventName,
          companies: chunk,
          date: today,
          total: companies.length,
          batch: Math.floor(i / PAGE_SIZE) + 1,
          batch_size: chunk.length,
          triggered_at: new Date().toISOString(),
          triggered_by: triggeredBy,
        }

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

  return {
    event_type: eventType,
    companies: companies.length,
    batches: Math.ceil(companies.length / PAGE_SIZE),
    webhooks_sent: sent,
    webhooks_failed: failed,
    success: true,
  }
}
