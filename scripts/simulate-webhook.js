process.env.NOMBA_WEBHOOK_SECRET = "NombaHackathon2026";
process.env.DATABASE_URL ||= "x"; process.env.NOMBA_ACCOUNT_ID ||= "x";
process.env.NOMBA_CLIENT_ID ||= "x"; process.env.NOMBA_CLIENT_SECRET ||= "x";
const { computeNombaSignature } = await import("../src/nomba/verify.js");

const ts = "2026-07-02T08:40:00Z";
const base = {
  event_type: "payment_success",
  data: {
    merchant: { walletId: "w1", userId: "u1" }, terminal: {},
    transaction: {
      type: "vact_transfer", transactionId: "API-VACT-TEST-1", responseCode: "",
      time: ts, transactionAmount: 25000,
      aliasAccountReference: process.argv[2] || "LBX-DEADBEEF", aliasAccountType: "VIRTUAL",
    },
    customer: {},
  },
};

async function post(requestId, sigOverride) {
  const payload = { ...base, requestId };
  const sig = sigOverride || computeNombaSignature(payload, ts);
  const res = await fetch("http://127.0.0.1:3000/webhooks/nomba", {    method: "POST",
    headers: { "Content-Type": "application/json", "nomba-signature": sig, "nomba-timestamp": ts },
    body: JSON.stringify(payload),
  });
  return `${res.status} ${await res.text()}`;
}

// Usage: node scripts/simulate-webhook.js [orderId] [requestId]
// Sends a correctly signed payment_success to localhost, then a duplicate,
// then a forged signature. Expect: FUNDED, duplicate no-op, rejected.
const requestId = process.argv[3] || "wh-sim-" + Date.now();
console.log("signed webhook:    ", await post(requestId));
console.log("duplicate delivery:", await post(requestId));
console.log("forged signature:  ", await post(requestId + "-forged", "FAKEsignatureAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="));
