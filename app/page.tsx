'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface WebhookUrl {
  id: number
  url: string
  description: string | null
  active: boolean
  created_at: string
}

interface InactiveData {
  cutoff: string
  count: number
  companies: number[]
}

export default function Home() {
  const [urls, setUrls] = useState<WebhookUrl[]>([])
  const [inactive, setInactive] = useState<InactiveData | null>(null)
  const [newUrl, setNewUrl] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [firing, setFiring] = useState(false)
  const [fireResult, setFireResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fireHourBrt, setFireHourBrt] = useState(4)
  const [savingTime, setSavingTime] = useState(false)
  const router = useRouter()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [urlsRes, inactiveRes, settingsRes] = await Promise.all([
      fetch('/api/webhooks').then(r => r.json()),
      fetch('/api/companies/inactive').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ])
    setUrls(urlsRes)
    setInactive(inactiveRes)
    if (settingsRes.fire_hour_brt) setFireHourBrt(parseInt(settingsRes.fire_hour_brt))
    setLoading(false)
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  async function addUrl() {
    if (!newUrl.trim()) return
    await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: newUrl, description: newDesc || null }),
    })
    setNewUrl('')
    setNewDesc('')
    loadData()
  }

  async function removeUrl(id: number) {
    await fetch('/api/webhooks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    loadData()
  }

  async function saveFireTime() {
    setSavingTime(true)
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'fire_hour_brt', value: String(fireHourBrt) }),
    })
    setSavingTime(false)
  }

  async function fireWebhooks() {
    setFiring(true)
    setFireResult(null)
    const res = await fetch('/api/webhooks/fire', { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setFireResult(`Enviados: ${data.webhooks_sent} | Falhas: ${data.webhooks_failed} | Empresas: ${data.companies}`)
    } else {
      setFireResult(`Erro: ${data.error}`)
    }
    setFiring(false)
  }

  const utcHour = (fireHourBrt + 3) % 24
  const cronExpression = `0 ${utcHour} * * *`

  const s = {
    container: { maxWidth: 900, margin: '0 auto', padding: '40px 20px' } as const,
    h1: { fontSize: 28, marginBottom: 8 } as const,
    subtitle: { color: '#888', marginBottom: 40 } as const,
    section: { background: '#141414', border: '1px solid #262626', borderRadius: 12, padding: 24, marginBottom: 24 } as const,
    sectionTitle: { fontSize: 18, marginTop: 0, marginBottom: 16 } as const,
    input: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '10px 14px', color: '#e5e5e5', fontSize: 14, width: '100%', boxSizing: 'border-box' as const } as const,
    row: { display: 'flex', gap: 12, marginBottom: 12 } as const,
    btn: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600 } as const,
    btnDanger: { background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 } as const,
    btnFire: { background: '#f59e0b', color: '#000', border: 'none', borderRadius: 12, padding: '14px 28px', cursor: 'pointer', fontSize: 16, fontWeight: 700, width: '100%' } as const,
    urlItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #262626' } as const,
    badge: { background: '#1e3a5f', color: '#60a5fa', padding: '4px 10px', borderRadius: 6, fontSize: 13, fontWeight: 600 } as const,
    alert: { background: '#1c1917', border: '1px solid #f59e0b', borderRadius: 8, padding: 16, marginTop: 16, color: '#fbbf24' } as const,
    code: { background: '#0a0a0a', border: '1px solid #333', borderRadius: 6, padding: '8px 12px', fontFamily: 'monospace', fontSize: 13, color: '#60a5fa', display: 'block', marginTop: 8 } as const,
  }

  if (loading) return <div style={s.container}><p>Carregando...</p></div>

  return (
    <div style={s.container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={s.h1}>Cash - Webhook Manager</h1>
        <button onClick={handleLogout} style={{ background: '#333', color: '#aaa', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Sair</button>
      </div>
      <p style={s.subtitle}>Monitore empresas sem vendas e dispare webhooks</p>

      {/* Horário do cron */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>Horário de Disparo Automático</h2>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 16 }}>
          Horário diário em que os webhooks serão disparados automaticamente (horário de Brasília).
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <select
            style={{ ...s.input, width: 120 }}
            value={fireHourBrt}
            onChange={e => setFireHourBrt(parseInt(e.target.value))}
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, '0')}:00 BRT</option>
            ))}
          </select>
          <button
            style={{ ...s.btn, opacity: savingTime ? 0.6 : 1 }}
            onClick={saveFireTime}
            disabled={savingTime}
          >
            {savingTime ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
        <div style={{ background: '#0f1a0f', border: '1px solid #166534', borderRadius: 8, padding: 14 }}>
          <p style={{ fontSize: 12, color: '#4ade80', margin: '0 0 6px 0' }}>
            Atualize o <strong>vercel.json</strong> com o schedule abaixo e faça redeploy:
          </p>
          <code style={s.code}>{`"schedule": "${cronExpression}"`}</code>
          <p style={{ fontSize: 11, color: '#555', margin: '6px 0 0 0' }}>
            {String(fireHourBrt).padStart(2, '0')}:00 BRT = {String(utcHour).padStart(2, '0')}:00 UTC
          </p>
        </div>
      </div>

      {/* Empresas inativas */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>Empresas sem venda paga (3+ dias)</h2>
        {inactive && (
          <>
            <p>
              <span style={s.badge}>{inactive.count} empresa(s)</span>
              <span style={{ color: '#888', marginLeft: 12, fontSize: 13 }}>
                Cutoff: {new Date(inactive.cutoff).toLocaleString('pt-BR')}
              </span>
            </p>
            {inactive.count > 0 && (
              <details>
                <summary style={{ cursor: 'pointer', color: '#60a5fa', fontSize: 14 }}>
                  Ver company_ids
                </summary>
                <div style={{ marginTop: 8, fontSize: 13, color: '#aaa', maxHeight: 200, overflow: 'auto' }}>
                  {inactive.companies.join(', ')}
                </div>
              </details>
            )}
          </>
        )}
      </div>

      {/* URLs de webhook */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>URLs de Webhook</h2>
        <div style={s.row}>
          <input
            style={{ ...s.input, flex: 2 }}
            placeholder="https://exemplo.com/webhook"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
          />
          <input
            style={{ ...s.input, flex: 1 }}
            placeholder="Descrição (opcional)"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
          />
          <button style={s.btn} onClick={addUrl}>Adicionar</button>
        </div>
        {urls.length === 0 ? (
          <p style={{ color: '#666', fontSize: 14 }}>Nenhuma URL cadastrada.</p>
        ) : (
          urls.map(u => (
            <div key={u.id} style={s.urlItem}>
              <div>
                <div style={{ fontSize: 14 }}>{u.url}</div>
                {u.description && <div style={{ fontSize: 12, color: '#888' }}>{u.description}</div>}
              </div>
              <button style={s.btnDanger} onClick={() => removeUrl(u.id)}>Remover</button>
            </div>
          ))
        )}
      </div>

      {/* Disparo manual */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>Disparo Manual</h2>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 16 }}>
          Envia webhook para todas as URLs cadastradas com as empresas inativas.
        </p>
        <button
          style={{ ...s.btnFire, opacity: firing ? 0.6 : 1 }}
          onClick={fireWebhooks}
          disabled={firing}
        >
          {firing ? 'Disparando...' : 'Disparar Webhooks Agora'}
        </button>
        {fireResult && <div style={s.alert}>{fireResult}</div>}
      </div>
    </div>
  )
}
