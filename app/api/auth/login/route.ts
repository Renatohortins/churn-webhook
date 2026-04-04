import { NextRequest, NextResponse } from 'next/server'
import { compareSync } from 'bcryptjs'
import { createToken } from '@/lib/auth'
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  // Rate limiting por IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'

  const limit = checkRateLimit(ip)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Muitas tentativas. Tente novamente em ${limit.retryAfter} segundos.` },
      { status: 429 }
    )
  }

  // Delay artificial para dificultar brute force (200-500ms)
  await new Promise(res => setTimeout(res, 200 + Math.random() * 300))

  const { username, password } = await req.json()

  if (!username || !password) {
    return NextResponse.json({ error: 'Credenciais obrigatórias' }, { status: 400 })
  }

  const validUser = username === process.env.ADMIN_USER
  const passwordHash = Buffer.from(process.env.ADMIN_PASSWORD_HASH_B64!, 'base64').toString('utf-8')
  const validPass = compareSync(password, passwordHash)

  if (!validUser || !validPass) {
    return NextResponse.json(
      { error: `Credenciais inválidas. ${limit.remaining} tentativa(s) restante(s).` },
      { status: 401 }
    )
  }

  // Login OK — reset rate limit e cria token
  resetRateLimit(ip)

  const token = await createToken(username)

  const response = NextResponse.json({ ok: true })
  response.cookies.set('cash_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24h
  })

  return response
}
