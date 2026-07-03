/**
 * Nomba webhook signature verification.
 *
 * Per https://developer.nomba.com/docs/api-basics/webhook the signed string is:
 *   event_type : requestId : merchant.userId : merchant.walletId :
 *   transaction.transactionId : transaction.type : transaction.time :
 *   transaction.responseCode : <nomba-timestamp header>
 *
 * HMAC-SHA256 with your webhook signature key, base64 encoded, compared
 * (case-insensitively) against the `nomba-signature` header.
 */
import crypto from "node:crypto";
import { config } from "../config.js";

export function computeNombaSignature(payload, timestamp, secret = config.nomba.webhookSecret) {
  const data = payload?.data || {};
  const merchant = data.merchant || {};
  const tx = data.transaction || {};

  let responseCode = tx.responseCode ?? "";
  if (responseCode === "null") responseCode = "";

  const signed = [
    payload?.event_type ?? "",
    payload?.requestId ?? "",
    merchant.userId ?? "",
    merchant.walletId ?? "",
    tx.transactionId ?? "",
    tx.type ?? "",
    tx.time ?? "",
    responseCode,
    timestamp ?? "",
  ].join(":");

  return crypto.createHmac("sha256", secret).update(signed).digest("base64");
}

export function verifyNombaWebhook(payload, headers) {
  // Header names are case-insensitive; express lowercases them for us.
  const signature = headers["nomba-signature"] || headers["nomba-sig-value"] || "";
  const timestamp = headers["nomba-timestamp"] || "";
  if (!signature || !timestamp) return { ok: false, reason: "missing signature headers" };

  const expected = computeNombaSignature(payload, timestamp);
  const ok = expected.toLowerCase() === String(signature).toLowerCase();
  return { ok, reason: ok ? "match" : "signature mismatch", expected };
}
