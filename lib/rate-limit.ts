// Rate limiter em memória por IP
const attempts = new Map<string, { count: number; firstAttempt: number; blockedUntil: number }>()

const MAX_ATTEMPTS = 5        // máximo de tentativas
const WINDOW_MS = 15 * 60_000 // janela de 15 minutos
const BLOCK_MS = 30 * 60_000  // bloqueio de 30 minutos

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number; retryAfter?: number } {
  const now = Date.now()
  const record = attempts.get(ip)

  if (record) {
    // Está bloqueado?
    if (record.blockedUntil > now) {
      const retryAfter = Math.ceil((record.blockedUntil - now) / 1000)
      return { allowed: false, remaining: 0, retryAfter }
    }

    // Janela expirou? Reset
    if (now - record.firstAttempt > WINDOW_MS) {
      attempts.set(ip, { count: 1, firstAttempt: now, blockedUntil: 0 })
      return { allowed: true, remaining: MAX_ATTEMPTS - 1 }
    }

    // Incrementa
    record.count++

    if (record.count > MAX_ATTEMPTS) {
      record.blockedUntil = now + BLOCK_MS
      return { allowed: false, remaining: 0, retryAfter: BLOCK_MS / 1000 }
    }

    return { allowed: true, remaining: MAX_ATTEMPTS - record.count }
  }

  // Primeira tentativa
  attempts.set(ip, { count: 1, firstAttempt: now, blockedUntil: 0 })
  return { allowed: true, remaining: MAX_ATTEMPTS - 1 }
}

export function resetRateLimit(ip: string) {
  attempts.delete(ip)
}
