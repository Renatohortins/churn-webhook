import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isValidEventType } from '@/lib/webhook-events'

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
  const { url, description, event_type } = await req.json()

  if (!url) return NextResponse.json({ error: 'URL obrigatória' }, { status: 400 })

  // Validar event_type (padrão: 'empresa_inativa')
  const finalEventType = event_type || 'empresa_inativa'
  if (!isValidEventType(finalEventType)) {
    return NextResponse.json(
      { error: `Tipo de evento inválido: ${finalEventType}` },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('webhook_urls')
    .insert({ url, description, event_type: finalEventType })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH — atualizar horário, ordem ou delay
export async function PATCH(req: NextRequest) {
  const { id, schedule_time, order, delay_seconds } = await req.json()

  if (!id) {
    return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  }

  const updateData: any = {}

  if (schedule_time) {
    updateData.schedule_time = brtToUtc(schedule_time)
  }

  if (typeof order === 'number') {
    updateData.order = order
  }

  if (typeof delay_seconds === 'number') {
    updateData.delay_seconds = Math.max(0, delay_seconds)
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
  }

  const { error } = await supabase
    .from('webhook_urls')
    .update(updateData)
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
