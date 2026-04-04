import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const PAGE_SIZE = 1000

interface InactiveCompany {
  company_id: number
  last_paid_at: string | null
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

// GET — chamado pelo Vercel Cron (a cada hora)
// Só dispara para URLs cujo schedule_time bate com a hora UTC atual
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Hora atual UTC (ex: "14:00")
  const now = new Date()
  const currentHour = `${String(now.getUTCHours()).padStart(2, '0')}:00`

  // Busca apenas URLs agendadas para esta hora
  const { data: urls } = await supabase
    .from('webhook_urls')
    .select('id, url, schedule_time')
    .eq('active', true)

  const matchingUrls = (urls ?? []).filter(u => {
    const scheduled = (u.schedule_time as string)?.slice(0, 5)
    return scheduled === currentHour
  })

  if (!matchingUrls.length) {
    return NextResponse.json({ message: `Nenhum webhook agendado para ${currentHour} UTC`, skipped: true })
  }

  return fireWebhooks('cron', matchingUrls)
}

// POST — chamado pelo botão do frontend (dispara para todas as URLs)
export async function POST() {
  const { data: urls } = await supabase
    .from('webhook_urls')
    .select('id, url')
    .eq('active', true)

  if (!urls?.length) {
    return NextResponse.json({ error: 'Nenhuma URL de webhook cadastrada' }, { status: 400 })
  }

  return fireWebhooks('manual', urls)
}

async function fireWebhooks(triggeredBy: string, urls: { id: number; url: string }[]) {
  let companies: InactiveCompany[]
  try {
    companies = await fetchAllInactive()
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  let sent = 0
  let failed = 0

  for (let i = 0; i < companies.length; i += PAGE_SIZE) {
    const chunk = companies.slice(i, i + PAGE_SIZE)
    const payload = {
      event: 'companies.inactive',
      companies: chunk,
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

  return NextResponse.json({
    companies: companies.length,
    batches: Math.ceil(companies.length / PAGE_SIZE),
    webhooks_sent: sent,
    webhooks_failed: failed,
  })
}
