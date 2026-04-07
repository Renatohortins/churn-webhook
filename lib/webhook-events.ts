// Tipos de eventos de webhook suportados
export const WEBHOOK_EVENT_TYPES = [
  {
    value: 'empresa_inativa',
    label: 'Empresas Que Não Transacionam',
    description: 'Empresas sem venda paga há 3+ dias',
  },
  {
    value: 'empresas_ativas_hoje',
    label: 'Empresas Transacionando Hoje',
    description: 'Empresas com pelo menos uma venda paga no dia atual',
  },
] as const

export type WebhookEventType = typeof WEBHOOK_EVENT_TYPES[number]['value']

export function isValidEventType(value: any): value is WebhookEventType {
  return WEBHOOK_EVENT_TYPES.some(e => e.value === value)
}
