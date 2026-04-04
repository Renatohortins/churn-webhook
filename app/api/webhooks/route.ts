import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET — listar URLs cadastradas
export async function GET() {
  const { data, error } = await supabase
    .from('webhook_urls')
    .select('*')
    .order('id', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST — cadastrar nova URL
export async function POST(req: NextRequest) {
  const { url, description } = await req.json()

  if (!url) return NextResponse.json({ error: 'URL obrigatória' }, { status: 400 })

  const { data, error } = await supabase
    .from('webhook_urls')
    .insert({ url, description })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH — atualizar horário
export async function PATCH(req: NextRequest) {
  const { id, schedule_time } = await req.json()

  if (!id || !schedule_time) {
    return NextResponse.json({ error: 'id e schedule_time obrigatórios' }, { status: 400 })
  }

  const utcTime = brtToUtc(schedule_time)

  const { error } = await supabase
    .from('webhook_urls')
    .update({ schedule_time: utcTime })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — remover URL
export async function DELETE(req: NextRequest) {
  const { id } = await req.json()

  const { error } = await supabase
    .from('webhook_urls')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Converte HH:MM BRT para UTC (BRT = UTC-3)
function brtToUtc(brt: string): string {
  const [h, m] = brt.split(':').map(Number)
  const utcH = (h + 3) % 24
  return `${String(utcH).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
