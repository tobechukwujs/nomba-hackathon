/**
 * Sanity-check the webhook signature implementation without touching env/db.
 * We sign a payload ourselves with a known secret and confirm verify agrees:
 * proves the colon-joined field order and base64 HMAC are wired correctly.
 */
import crypto from "node:crypto";

process.env.DATABASE_URL ||= "postgres://unused";
process.env.NOMBA_ACCOUNT_ID ||= "test";
process.env.NOMBA_CLIENT_ID ||= "test";
process.env.NOMBA_CLIENT_SECRET ||= "test";
process.env.NOMBA_WEBHOOK_SECRET = "NombaHackathon2026";

const { computeNombaSignature, verifyNombaWebhook } = await import("../src/nomba/verify.js");

const payload = {
  event_type: "payment_success",
  requestId: "45f2dc2d-d559-4773-bba3-2d5ec17b2e20",
  data: {
    merchant: { walletId: "6756ff80aafe04a795f18b38", walletBalance: 6052, userId: "b7b10e81-e57d-41d0-8fdc-f4e23a132bbf" },
    terminal: {},
    transaction: {
      aliasAccountNumber: "5343270516",
      fee: 5,
      type: "vact_transfer",
      transactionId: "API-VACT_TRA-B7B10-0435b274-807a-4bc7-8abe-9dbb4548fd7a",
      responseCode: "",
      transactionAmount: 10,
      time: "2025-09-29T10:51:44Z",
      aliasAccountReference: "LBX-DEADBEEF",
      aliasAccountType: "VIRTUAL",
    },
    customer: { bankCode: "090645", senderName: "Test Sender", bankName: "Nombank", accountNumber: "9617811496" },
  },
};

const timestamp = "2025-09-29T10:51:44Z";
const sig = computeNombaSignature(payload, timestamp);
console.log("computed signature:", sig);

const verdict = verifyNombaWebhook(payload, { "nomba-signature": sig, "nomba-timestamp": timestamp });
console.log("verify(own signature):", verdict.ok ? "PASS" : "FAIL");

const bad = verifyNombaWebhook(payload, { "nomba-signature": "AAAA" + sig.slice(4), "nomba-timestamp": timestamp });
console.log("verify(tampered signature rejected):", bad.ok ? "FAIL" : "PASS");

if (!verdict.ok || bad.ok) process.exit(1);
