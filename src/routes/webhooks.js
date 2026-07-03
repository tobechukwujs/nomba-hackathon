/**
 * POST /webhooks/nomba
 *
 * The trust trigger of the whole product. Rules:
 *  1. Verify the HMAC signature (nomba-signature header) before touching state.
 *  2. Insert into webhook_events keyed by requestId first: Nomba retries with
 *     exponential backoff, so duplicates must be no-ops.
 *  3. Always return 200 fast; heavy work is done inline here because volumes
 *     are hackathon-sized, but failures are logged, not thrown.
 */
import { Router } from "express";
import { q, one } from "../db.js";
import { config } from "../config.js";
import { verifyNombaWebhook } from "../nomba/verify.js";
import { markFunded, finalizePayout } from "../services/orders.js";

export const webhooksRouter = Router();

webhooksRouter.post("/nomba", async (req, res) => {
  const payload = req.body;
  const requestId = payload?.requestId;
  if (!requestId) return res.status(400).json({ error: "missing requestId" });

  const verdict = config.nomba.verifyWebhooks
    ? verifyNombaWebhook(payload, req.headers)
    : { ok: true, reason: "verification disabled" };

  // Log every delivery exactly once. Conflict = Nomba retry = already handled.
  const inserted = await q(
    `INSERT INTO webhook_events (request_id, event_type, payload, signature_ok)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (request_id) DO NOTHING`,
    [requestId, payload.event_type || "unknown", payload, verdict.ok]
  );
  if (inserted.rowCount === 0) {
    return res.status(200).json({ ok: true, duplicate: true });
  }

  if (!verdict.ok) {
    console.warn(`[webhook ${requestId}] rejected: ${verdict.reason}`);
    // 200 so Nomba stops retrying a payload we will never accept.
    return res.status(200).json({ ok: false, reason: "signature rejected" });
  }

  try {
    const tx = payload?.data?.transaction || {};
    switch (payload.event_type) {
      case "payment_success": {
        // Match by (a) checkout orderReference in merchantTxRef/narration is not
        // guaranteed, so we rely on the deterministic ids we control:
        //   - virtual account payments carry aliasAccountReference = our order id
        //   - checkout payments: Nomba orderReference = our order id
        const orderId =
          tx.aliasAccountReference ||
          tx.orderReference ||
          tx.merchantTxRef ||
          (await matchByOrderReference(payload));
        if (orderId) {
          const order = await markFunded(orderId, tx.transactionId);
          if (order) {
            await q(`UPDATE webhook_events SET order_id = $1 WHERE request_id = $2`, [order.id, requestId]);
            console.log(`[webhook ${requestId}] order ${order.id} -> ${order.status}`);
          } else {
            console.warn(`[webhook ${requestId}] payment_success for unknown order ref ${orderId}`);
          }
        } else {
          console.warn(`[webhook ${requestId}] payment_success with no matchable reference`);
        }
        break;
      }
      case "payout_success": {
        if (tx.merchantTxRef) {
          const order = await finalizePayout(tx.merchantTxRef, tx.transactionId);
          if (order) {
            await q(`UPDATE webhook_events SET order_id = $1 WHERE request_id = $2`, [order.id, requestId]);
            console.log(`[webhook ${requestId}] payout finalised for ${order.id} -> ${order.status}`);
          }
        }
        break;
      }
      case "payout_failed":
      case "payment_failed":
      case "payment_reversal":
      case "payout_refund":
        console.warn(`[webhook ${requestId}] ${payload.event_type}: ${JSON.stringify(tx).slice(0, 300)}`);
        break;
      default:
        console.log(`[webhook ${requestId}] unhandled event ${payload.event_type}`);
    }
  } catch (err) {
    // Never 5xx a verified webhook we already logged; reconcile from the event log instead.
    console.error(`[webhook ${requestId}] processing error: ${err.message}`);
  }

  return res.status(200).json({ ok: true });
});

/** Fallback: some payloads carry the checkout reference in nested fields. */
async function matchByOrderReference(payload) {
  const blob = JSON.stringify(payload);
  const m = blob.match(/LBX-[A-F0-9]{8}/);
  if (!m) return null;
  const found = await one(`SELECT id FROM orders WHERE id = $1`, [m[0]]);
  return found?.id || null;
}
