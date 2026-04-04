import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET() {
  const valid = await getSession()
  return NextResponse.json({ authenticated: valid })
}
