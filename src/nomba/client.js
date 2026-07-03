/**
 * Minimal Nomba API client.
 * Endpoints per https://developer.nomba.com:
 *   POST /v1/auth/token/issue          (client_credentials, token lives ~30 min)
 *   POST /v1/checkout/order            -> data.checkoutLink, data.orderReference
 *   POST /v1/accounts/virtual          -> per-order NUBAN
 *   POST /v2/transfers/bank            -> payout / refund (idempotent via merchantTxRef + X-Idempotent-key)
 *   GET  /v1/transactions/transaction-requery/{sessionId}
 */
import crypto from "node:crypto";
import { config } from "../config.js";

const { baseUrl, accountId, clientId, clientSecret } = config.nomba;

let cachedToken = null; // { token, expiresAtMs }

async function nombaFetch(path, { method = "GET", body, auth = true, idempotencyKey } = {}) {
  const headers = {
    "Content-Type": "application/json",
    accountId,
  };
  if (auth) headers.Authorization = `Bearer ${await getAccessToken()}`;
  if (idempotencyKey) headers["X-Idempotent-key"] = idempotencyKey;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(`Nomba ${method} ${path} failed (${res.status}): ${text.slice(0, 500)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

export async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs - 60_000 > now) return cachedToken.token;

  const res = await fetch(`${baseUrl}/v1/auth/token/issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", accountId },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json?.data?.access_token) {
    throw new Error(`Nomba auth failed (${res.status}): ${JSON.stringify(json).slice(0, 500)}`);
  }
  // Tokens expire after ~30 minutes; cache for 25 to be safe.
  cachedToken = { token: json.data.access_token, expiresAtMs: now + 25 * 60_000 };
  return cachedToken.token;
}

/**
 * Create an online checkout order. amountNaira is a decimal string like "10000.00".
 * Returns { checkoutLink, orderReference }.
 */
export async function createCheckoutOrder({ orderReference, amountNaira, customerEmail, callbackUrl }) {
  const json = await nombaFetch("/v1/checkout/order", {
    method: "POST",
    body: {
      order: {
        orderReference,
        callbackUrl,
        customerEmail,
        amount: amountNaira,
        currency: "NGN",
        // Hackathon: header accountId = PARENT, but the order is scoped to
        // OUR sub-account so collections land in our team balance.
        accountId: config.nomba.subAccountId || accountId,
      },
    },
  });
  return json.data; // { checkoutLink, orderReference }
}

/**
 * Create a dedicated virtual account for one order so bank-transfer payers
 * have an isolated, reconcilable NUBAN. accountRef ties it back to the order.
 */
export async function createVirtualAccount({ accountRef, accountName, expectedAmountNaira }) {
  const json = await nombaFetch("/v1/accounts/virtual", {
    method: "POST",
    body: {
      accountRef,
      accountName,
      ...(expectedAmountNaira ? { expectedAmount: expectedAmountNaira } : {}),
    },
  });
  return json.data;
}

/**
 * Payout to a Nigerian bank account. amountNaira is a Number (e.g. 3500).
 * merchantTxRef doubles as the idempotency key: safe to retry.
 * A 201/PROCESSING response means "rely on the payout webhook for final status".
 */
export async function transferToBank({ amountNaira, accountNumber, accountName, bankCode, merchantTxRef, narration, senderName = "Lockbox Escrow" }) {
  const body = {
    amount: amountNaira,
    accountNumber,
    accountName,
    bankCode,
    merchantTxRef,
    senderName,
    narration,
  };
  // Collections land in our sub-account, so payouts should leave from it too:
  // POST /v2/transfers/bank/{subAccountId}. If sub-account transfers are not
  // enabled on this account, fall back to the parent transfer endpoint.
  const sub = config.nomba.subAccountId;
  if (sub) {
    try {
      return await nombaFetch(`/v2/transfers/bank/${sub}`, { method: "POST", idempotencyKey: merchantTxRef, body });
    } catch (err) {
      if (![403, 404].includes(err.status)) throw err;
      console.warn(`[transfer] sub-account endpoint rejected (${err.status}), falling back to parent: ${err.message}`);
    }
  }
  return nombaFetch("/v2/transfers/bank", { method: "POST", idempotencyKey: merchantTxRef, body });
}

export async function requeryBySessionId(sessionId) {
  return nombaFetch(`/v1/transactions/transaction-requery/${sessionId}`);
}

export async function parentBalance() {
  return nombaFetch("/v1/accounts/balance");
}

export function newRef(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}
