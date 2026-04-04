'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error)
        return
      }

      router.push('/')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.wrapper}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.logoArea}>
          <div style={styles.logo}>C</div>
          <h1 style={styles.title}>Cash</h1>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Usuário</label>
          <input
            style={styles.input}
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Senha</label>
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <button
          type="submit"
          style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }}
          disabled={loading}
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a0a',
  },
  card: {
    background: '#141414',
    border: '1px solid #262626',
    borderRadius: 16,
    padding: 40,
    width: 380,
    maxWidth: '90vw',
  },
  logoArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
    justifyContent: 'center',
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: '#2563eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    fontWeight: 800,
    color: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    margin: 0,
    color: '#e5e5e5',
  },
  field: {
    marginBottom: 20,
  },
  label: {
    display: 'block',
    fontSize: 13,
    color: '#888',
    marginBottom: 6,
    fontWeight: 500,
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#e5e5e5',
    fontSize: 15,
    boxSizing: 'border-box' as const,
    outline: 'none',
  },
  error: {
    background: '#1c1917',
    border: '1px solid #dc2626',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#f87171',
    fontSize: 13,
    marginBottom: 16,
  },
  btn: {
    width: '100%',
    padding: 14,
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 4,
  },
}
