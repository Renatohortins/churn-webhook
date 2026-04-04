import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 3)
  const cutoffISO = cutoff.toISOString()

  // Tenta usar a RPC
  const { data, error } = await supabase
    .rpc('get_inactive_companies', { cutoff_date: cutoffISO })
    .limit(10000)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    cutoff: cutoffISO,
    count: data?.length ?? 0,
    companies: (data ?? []).map((r: any) => r.company_id),
  })
}
