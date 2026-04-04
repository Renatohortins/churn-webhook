import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const body = await req.json()

  // O evento da Bestfy vem com { id, type, objectId, url, data: { ...transação } }
  const tx = body.data
  if (!tx?.id) {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const row = {
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
  }

  // Upsert na transação
  const { error: txErr } = await supabase
    .from('transactions')
    .upsert(row, { onConflict: 'id' })

  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 })
  }

  // Items
  if (tx.items?.length) {
    const items = tx.items.map((i: any) => ({
      transaction_id: tx.id,
      external_ref:   i.externalRef,
      title:          i.title,
      unit_price:     i.unitPrice,
      quantity:       i.quantity,
      tangible:       i.tangible,
    }))
    await supabase.from('transaction_items').delete().eq('transaction_id', tx.id)
    await supabase.from('transaction_items').insert(items)
  }

  // Splits
  if (tx.splits?.length) {
    const splits = tx.splits.map((s: any) => ({
      transaction_id:        tx.id,
      recipient_id:          s.recipientId,
      amount:                s.amount,
      net_amount:            s.netAmount,
      charge_processing_fee: s.chargeProcessingFee,
    }))
    await supabase.from('transaction_splits').delete().eq('transaction_id', tx.id)
    await supabase.from('transaction_splits').insert(splits)
  }

  // Atualiza company_activity se for venda paga
  if (tx.companyId) {
    if (tx.status === 'paid' && tx.paidAt) {
      await supabase.from('company_activity').upsert({
        company_id:   tx.companyId,
        last_paid_at: tx.paidAt,
        total_paid:   1,
      }, { onConflict: 'company_id' })
    } else {
      // Garante que a empresa existe na tabela
      await supabase.from('company_activity').upsert({
        company_id:   tx.companyId,
        last_paid_at: null,
        total_paid:   0,
      }, { onConflict: 'company_id' })
    }
  }

  return NextResponse.json({ ok: true, transaction_id: tx.id })
}
