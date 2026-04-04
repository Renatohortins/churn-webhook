import { createClient, SupabaseClient } from '@supabase/supabase-js'

export async function saveBatch(supabase: SupabaseClient, transactions: any[]) {
  const rows = transactions.map(tx => ({
    id:                  tx.id,
    external_id:         tx.externalId,
    secure_id:           tx.secureId,
    secure_url:          tx.secureUrl,
    external_ref:        tx.externalRef,
    authorization_code:  tx.authorizationCode,
    acquirer_type:       tx.acquirerType,
    acquirer_status:     tx.acquirerStatus,
    tenant_id:           tx.tenantId,
    tenant_acquirer_id:  tx.tenantAcquirerId,
    company_id:          tx.companyId,
    amount:              tx.amount,
    paid_amount:         tx.paidAmount,
    refunded_amount:     tx.refundedAmount,
    base_price:          tx.basePrice,
    interest_rate:       tx.interestRate,
    installments:        tx.installments,
    payment_method:      tx.paymentMethod,
    status:              tx.status,
    fee_fixed_amount:    tx.fee?.fixedAmount,
    fee_spread_pct:      tx.fee?.spreadPercentage,
    fee_estimated:       tx.fee?.estimatedFee,
    fee_net_amount:      tx.fee?.netAmount,
    created_at:          tx.createdAt,
    updated_at:          tx.updatedAt,
    paid_at:             tx.paidAt,
    customer_id:         tx.customerId,
    card_id:             tx.cardId,
    subscription_id:     tx.subscriptionId,
    billing_id:          tx.billingId,
    checkout_id:         tx.checkoutId,
    customer_name:       tx.customer?.name,
    customer_email:      tx.customer?.email,
    customer_phone:      tx.customer?.phone,
    customer_document:   tx.customer?.document?.number,
    customer_doc_type:   tx.customer?.document?.type,
    customer_address:    tx.customer?.address ?? null,
    card_brand:          tx.card?.brand,
    card_holder:         tx.card?.holderName,
    card_first_digits:   tx.card?.firstDigits,
    card_last_digits:    tx.card?.lastDigits,
    card_exp_month:      tx.card?.expirationMonth,
    card_exp_year:       tx.card?.expirationYear,
    pix_qrcode:          tx.pix?.qrcode,
    pix_expiration:      tx.pix?.expirationDate,
    pix_end2end_id:      tx.pix?.end2EndId,
    delivery_status:     tx.delivery?.status,
    delivery_tracking:   tx.delivery?.trackingCode,
    refused_reason:      tx.refusedReason ?? null,
    antifraud:           tx.antifraud ?? null,
    informations:        tx.informations ?? null,
    traceable:           tx.traceable,
    postback_url:        tx.postbackUrl,
    ip:                  tx.ip,
    synced_at:           new Date().toISOString(),
  }))

  const CHUNK = 50
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk      = rows.slice(i, i + CHUNK)
    const chunkTxs   = transactions.slice(i, i + CHUNK)
    const chunkTxIds = chunkTxs.map(tx => tx.id)

    const { error: txErr } = await supabase
      .from('transactions')
      .upsert(chunk, { onConflict: 'id' })
    if (txErr) throw new Error(`Erro ao salvar transações: ${txErr.message}`)

    const chunkItems = chunkTxs.flatMap(tx =>
      (tx.items ?? []).map((i: any) => ({
        transaction_id: tx.id,
        external_ref:   i.externalRef,
        title:          i.title,
        unit_price:     i.unitPrice,
        quantity:       i.quantity,
        tangible:       i.tangible,
      }))
    )

    const chunkSplits = chunkTxs.flatMap(tx =>
      (tx.splits ?? []).map((s: any) => ({
        transaction_id:        tx.id,
        recipient_id:          s.recipientId,
        amount:                s.amount,
        net_amount:            s.netAmount,
        charge_processing_fee: s.chargeProcessingFee,
      }))
    )

    if (chunkItems.length) {
      await supabase.from('transaction_items').delete().in('transaction_id', chunkTxIds)
      await supabase.from('transaction_items').insert(chunkItems)
    }

    if (chunkSplits.length) {
      await supabase.from('transaction_splits').delete().in('transaction_id', chunkTxIds)
      await supabase.from('transaction_splits').insert(chunkSplits)
    }
  }

  // Atualiza company_activity para empresas com transações pagas
  const paidByCompany = new Map<number, string>()
  for (const tx of transactions) {
    if (tx.companyId && tx.status === 'paid' && tx.paidAt) {
      const existing = paidByCompany.get(tx.companyId)
      if (!existing || tx.paidAt > existing) {
        paidByCompany.set(tx.companyId, tx.paidAt)
      }
    }
  }

  // Upsert todas as empresas do lote (inclusive sem venda paga)
  const companyIds = [...new Set(transactions.filter(tx => tx.companyId).map(tx => tx.companyId))]
  for (const cid of companyIds) {
    const lastPaid = paidByCompany.get(cid) ?? null
    await supabase.from('company_activity').upsert({
      company_id:   cid,
      last_paid_at: lastPaid,
      total_paid:   lastPaid ? 1 : 0,
    }, { onConflict: 'company_id' })
  }
}
