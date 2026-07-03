/**
 * The escrow state machine. All money-moving decisions live here.
 *
 * CREATED --payment_success webhook--> FUNDED --vendor--> SHIPPED
 *   SHIPPED --buyer confirm--> DELIVERED --system--> RELEASING --payout_success--> RELEASED
 *   SHIPPED --auto-release timer--> DELIVERED (system) -> ... -> RELEASED
 *   FUNDED/SHIPPED --buyer dispute--> DISPUTED --resolve--> REFUNDING --payout_success--> REFUNDED
 *                                              \--resolve--> RELEASING -> RELEASED
 */
import crypto from "node:crypto";
import { q, one } from "../db.js";
import { config } from "../config.js";
import { createCheckoutOrder, createVirtualAccount, transferToBank } from "../nomba/client.js";

const VALID = {
  CREATED: ["FUNDED", "EXPIRED"],
  FUNDED: ["SHIPPED", "DISPUTED"],
  SHIPPED: ["DELIVERED", "DISPUTED"],
  DELIVERED: ["RELEASING"],
  RELEASING: ["RELEASED"],
  DISPUTED: ["RELEASING", "REFUNDING"],
  REFUNDING: ["REFUNDED"],
};

export function canTransition(from, to) {
  return (VALID[from] || []).includes(to);
}

async function transition(orderId, from, to, actor, note = null) {
  const res = await q(
    `UPDATE orders SET status = $1,
       funded_at    = CASE WHEN $1 = 'FUNDED'    THEN now() ELSE funded_at END,
       shipped_at   = CASE WHEN $1 = 'SHIPPED'   THEN now() ELSE shipped_at END,
       delivered_at = CASE WHEN $1 = 'DELIVERED' THEN now() ELSE delivered_at END,
       released_at  = CASE WHEN $1 = 'RELEASED'  THEN now() ELSE released_at END,
       disputed_at  = CASE WHEN $1 = 'DISPUTED'  THEN now() ELSE disputed_at END,
       refunded_at  = CASE WHEN $1 = 'REFUNDED'  THEN now() ELSE refunded_at END
     WHERE id = $2 AND status = $3
     RETURNING *`,
    [to, orderId, from]
  );
  if (res.rowCount === 0) return null; // state raced/changed; caller decides what to do
  await q(
    `INSERT INTO order_events (order_id, from_state, to_state, actor, note) VALUES ($1,$2,$3,$4,$5)`,
    [orderId, from, to, actor, note]
  );
  return res.rows[0];
}

export function naira(kobo) {
  return (Number(kobo) / 100).toFixed(2);
}

export async function getOrder(id) {
  return one(`SELECT * FROM orders WHERE id = $1`, [id]);
}

export async function getOrderEvents(id) {
  const res = await q(`SELECT * FROM order_events WHERE order_id = $1 ORDER BY id ASC`, [id]);
  return res.rows;
}

export async function listOrders() {
  const res = await q(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 100`);
  return res.rows;
}

/**
 * Create an order + its Nomba payment rails (checkout link and, best-effort,
 * a dedicated virtual account for bank-transfer payers).
 */
export async function createOrder(input) {
  const id = `LBX-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const amountKobo = Math.round(Number(input.amountNaira) * 100);
  if (!Number.isFinite(amountKobo) || amountKobo <= 0) throw new Error("Invalid amount");
  const feeKobo = Math.round((amountKobo * config.escrow.feePercent) / 100);

  await q(
    `INSERT INTO orders
      (id, description, amount_kobo, fee_kobo, vendor_name, vendor_phone,
       vendor_bank_code, vendor_account_no, vendor_account_name,
       buyer_email, buyer_phone, auto_release_hours)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id, input.description, amountKobo, feeKobo,
      input.vendorName, input.vendorPhone || null,
      input.vendorBankCode, input.vendorAccountNo, input.vendorAccountName,
      input.buyerEmail, input.buyerPhone || null,
      input.autoReleaseHours || config.escrow.autoReleaseHours,
    ]
  );
  await q(`INSERT INTO order_events (order_id, from_state, to_state, actor, note) VALUES ($1,NULL,'CREATED','vendor',$2)`, [id, input.description]);

  // 1) Checkout link (card + transfer inside Nomba's hosted page)
  const checkout = await createCheckoutOrder({
    orderReference: id,
    amountNaira: naira(amountKobo),
    customerEmail: input.buyerEmail,
    callbackUrl: `${config.baseUrl}/o/${id}?paid=1`,
  });

  // 2) Dedicated virtual account (best effort; order still works without it)
  let va = null;
  try {
    va = await createVirtualAccount({
      accountRef: id,
      accountName: `LOCKBOX/${input.vendorName.slice(0, 20).toUpperCase()}`,
      expectedAmountNaira: naira(amountKobo),
    });
  } catch (err) {
    console.warn(`[order ${id}] virtual account creation failed: ${err.message}`);
  }

  await q(
    `UPDATE orders SET checkout_link = $1, nomba_order_reference = $2,
       virtual_account_ref = $3, virtual_account_no = $4, virtual_bank_name = $5
     WHERE id = $6`,
    [
      checkout.checkoutLink, checkout.orderReference || id,
      va ? id : null, va?.accountNumber || va?.aliasAccountNumber || null, va?.bankName || "Amucha MFB (Nomba)",
      id,
    ]
  );
  return getOrder(id);
}

/** Called by the webhook route on a verified payment_success. Idempotent. */
export async function markFunded(orderId, txId) {
  const order = await getOrder(orderId);
  if (!order) return null;
  if (order.status !== "CREATED") return order; // duplicate webhook / already funded
  await q(`UPDATE orders SET payment_tx_id = $1 WHERE id = $2`, [txId, orderId]);
  return transition(orderId, "CREATED", "FUNDED", "nomba_webhook", `Nomba tx ${txId}`);
}

export async function markShipped(orderId) {
  return transition(orderId, "FUNDED", "SHIPPED", "vendor");
}

/** Buyer confirms delivery -> DELIVERED, then we initiate the payout. */
export async function confirmDelivery(orderId, actor = "buyer") {
  const order = await getOrder(orderId);
  if (!order) throw new Error("Order not found");
  const delivered = await transition(orderId, "SHIPPED", "DELIVERED", actor);
  if (!delivered) throw new Error(`Cannot confirm delivery from state ${order.status}`);
  return releasePayout(orderId);
}

/** Initiate the Nomba transfer to the vendor. RELEASING until payout webhook lands. */
export async function releasePayout(orderId) {
  const order = await getOrder(orderId);
  if (!order || order.status !== "DELIVERED") return order;

  const payoutKobo = Number(order.amount_kobo) - Number(order.fee_kobo);
  const merchantTxRef = order.payout_tx_ref || `LBXPAY_${orderId}_${Date.now()}`;
  await q(`UPDATE orders SET payout_tx_ref = $1 WHERE id = $2`, [merchantTxRef, orderId]);

  const releasing = await transition(orderId, "DELIVERED", "RELEASING", "system", `payout ${naira(payoutKobo)} NGN to vendor`);
  if (!releasing) return getOrder(orderId);

  const res = await transferToBank({
    amountNaira: Number(naira(payoutKobo)),
    accountNumber: order.vendor_account_no,
    accountName: order.vendor_account_name,
    bankCode: order.vendor_bank_code,
    merchantTxRef,
    narration: `Lockbox escrow release ${orderId}`,
  });

  const txId = res?.data?.id || null;
  if (txId) await q(`UPDATE orders SET payout_tx_id = $1 WHERE id = $2`, [txId, orderId]);

  // If Nomba answers SUCCESS synchronously, close it out; otherwise the
  // payout_success webhook (matched by merchantTxRef) finishes the job.
  if (res?.data?.status === "SUCCESS") {
    await transition(orderId, "RELEASING", "RELEASED", "system", `transfer ${txId} immediate success`);
  }
  return getOrder(orderId);
}

export async function openDispute(orderId, reason, actor = "buyer") {
  const order = await getOrder(orderId);
  if (!order) throw new Error("Order not found");
  const updated = await transition(orderId, order.status, "DISPUTED", actor, reason);
  if (!updated) throw new Error(`Cannot dispute from state ${order.status}`);
  await q(`UPDATE orders SET dispute_reason = $1 WHERE id = $2`, [reason, orderId]);
  return updated;
}

/**
 * Resolve a dispute. resolution = 'refund' needs buyer bank details;
 * resolution = 'release' pays the vendor as normal.
 */
export async function resolveDispute(orderId, resolution, buyerBank) {
  const order = await getOrder(orderId);
  if (!order || order.status !== "DISPUTED") throw new Error("Order is not in dispute");

  if (resolution === "release") {
    await transition(orderId, "DISPUTED", "RELEASING", "system", "dispute resolved in vendor favour");
    // Reuse the payout path by faking the DELIVERED hop in the ledger:
    const merchantTxRef = `LBXPAY_${orderId}_${Date.now()}`;
    const payoutKobo = Number(order.amount_kobo) - Number(order.fee_kobo);
    await q(`UPDATE orders SET payout_tx_ref = $1 WHERE id = $2`, [merchantTxRef, orderId]);
    const res = await transferToBank({
      amountNaira: Number(naira(payoutKobo)),
      accountNumber: order.vendor_account_no,
      accountName: order.vendor_account_name,
      bankCode: order.vendor_bank_code,
      merchantTxRef,
      narration: `Lockbox dispute release ${orderId}`,
    });
    if (res?.data?.status === "SUCCESS") {
      await transition(orderId, "RELEASING", "RELEASED", "system", `transfer ${res.data.id} immediate success`);
    }
    return getOrder(orderId);
  }

  if (resolution === "refund") {
    if (!buyerBank?.accountNumber || !buyerBank?.bankCode || !buyerBank?.accountName) {
      throw new Error("Refund requires buyer accountNumber, bankCode and accountName");
    }
    await transition(orderId, "DISPUTED", "REFUNDING", "system", "dispute resolved in buyer favour");
    const merchantTxRef = `LBXRFD_${orderId}_${Date.now()}`;
    await q(`UPDATE orders SET payout_tx_ref = $1 WHERE id = $2`, [merchantTxRef, orderId]);
    const res = await transferToBank({
      amountNaira: Number(naira(order.amount_kobo)), // full refund, Lockbox eats the fee
      accountNumber: buyerBank.accountNumber,
      accountName: buyerBank.accountName,
      bankCode: buyerBank.bankCode,
      merchantTxRef,
      narration: `Lockbox refund ${orderId}`,
    });
    if (res?.data?.status === "SUCCESS") {
      await transition(orderId, "REFUNDING", "REFUNDED", "system", `transfer ${res.data.id} immediate success`);
    }
    return getOrder(orderId);
  }

  throw new Error("resolution must be 'release' or 'refund'");
}

/** Payout webhook landed: finalise RELEASING/REFUNDING orders by merchantTxRef. */
export async function finalizePayout(merchantTxRef, txId) {
  const order = await one(`SELECT * FROM orders WHERE payout_tx_ref = $1`, [merchantTxRef]);
  if (!order) return null;
  if (order.status === "RELEASING") return transition(order.id, "RELEASING", "RELEASED", "nomba_webhook", `payout tx ${txId}`);
  if (order.status === "REFUNDING") return transition(order.id, "REFUNDING", "REFUNDED", "nomba_webhook", `refund tx ${txId}`);
  return order;
}

/** Sweep: auto-release orders the buyer never confirmed. Run on an interval. */
export async function autoReleaseSweep() {
  const res = await q(
    `SELECT id FROM orders
     WHERE status = 'SHIPPED'
       AND shipped_at + (auto_release_hours || ' hours')::interval < now()`
  );
  for (const row of res.rows) {
    try {
      console.log(`[auto-release] order ${row.id} window elapsed, releasing`);
      const delivered = await transition(row.id, "SHIPPED", "DELIVERED", "system", "auto-release window elapsed");
      if (delivered) await releasePayout(row.id);
    } catch (err) {
      console.error(`[auto-release] ${row.id} failed: ${err.message}`);
    }
  }
}
