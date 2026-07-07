# Lockbox

Escrow layer for Nigerian social commerce, built on the Nomba API stack.

Buyers on Instagram, WhatsApp, and TikTok pay strangers upfront and pray. Lockbox removes the prayer: money locks in a Nomba-held account when the buyer pays, the vendor ships against confirmed funds, and payout lands in the vendor's bank the moment delivery is confirmed. Disputes freeze funds; refunds go back to the buyer on the same rails.

Built solo for the **DevCareer x Nomba Hackathon 2026**.

## The escrow state machine

```
CREATED ──payment_success webhook──▶ FUNDED ──vendor ships──▶ SHIPPED
                                        │                        │
                                        │                buyer confirms /
                                        │                auto-release timer
                                        ▼                        ▼
                                    DISPUTED              DELIVERED ─▶ RELEASING ─▶ RELEASED
                                        │                              (Nomba transfer, finalised
                              resolve: refund │ release                 by payout_success webhook)
                                        ▼
                                   REFUNDING ─▶ REFUNDED
```

Every transition is written to `order_events`: a full audit trail per order.

## Nomba integration (all four rails)

| Rail | Endpoint | Role in Lockbox |
|---|---|---|
| Checkout | `POST /v1/checkout/order` | Buyer pays by card or transfer via a hosted link; `orderReference` = Lockbox order id |
| Virtual Accounts | `POST /v1/accounts/virtual` | Each order gets its own NUBAN (`accountRef` = order id) so bank-transfer payers are reconciled deterministically |
| Webhooks | `POST /webhooks/nomba` | `payment_success` is the trust trigger that flips CREATED→FUNDED; `payout_success` finalises RELEASING→RELEASED. HMAC-SHA256 signature verified per docs, idempotent by `requestId` |
| Transfers | `POST /v2/transfers/bank` | Release to vendor / refund to buyer. `merchantTxRef` doubles as the `X-Idempotent-key` so retries are safe |

Auth: `POST /v1/auth/token/issue` (client credentials), token cached for 25 minutes.

### Hackathon account structure

The hackathon runs on one shared **parent** account with per-team **sub-accounts**:

- The `accountId` **header** is always the parent id (this is the #1 cause of 403s if wrong).
- Our sub-account id (`NOMBA_SUB_ACCOUNT_ID`) is scoped per call: `order.accountId` on checkout orders so collections land in our balance, and `/v2/transfers/bank/{subAccountId}` for payouts (with automatic fallback to the parent transfer endpoint).
- Checkout webhooks only fire in **production**, so we run LIVE credentials against `api.nomba.com`. Hackathon sub-accounts are set to instant settlement.

### Webhook verification

Signed string per Nomba docs, HMAC-SHA256 + base64, compared case-insensitively with `nomba-signature`:

```
event_type:requestId:merchant.userId:merchant.walletId:
transaction.transactionId:transaction.type:transaction.time:
transaction.responseCode:<nomba-timestamp header>
```

Run `npm run test:signature` to self-test the implementation.

## Run it

```bash
cp .env.example .env        # fill in Nomba credentials from your hackathon email
createdb lockbox            # or point DATABASE_URL anywhere
npm install
npm run db:setup
npm run dev
```

Expose the webhook while developing:

```bash
ngrok http 3000             # or: cloudflared tunnel --url http://localhost:3000
```

Set `BASE_URL` in `.env` to the tunnel URL and submit `https://<tunnel>/webhooks/nomba` in the hackathon webhook form (updates propagate every 2 hours).

## Try the flow

1. `http://localhost:3000` → create an order (vendor form).
2. Open the buyer link `/o/LBX-XXXXXXXX`, pay via the checkout link or the order's dedicated virtual account.
3. Watch the webhook flip the order to **Money locked** (FUNDED).
4. Vendor marks shipped → buyer confirms → Nomba transfer fires → **Vendor paid**.
5. Or open a dispute and resolve via `POST /api/orders/:id/resolve` with `{"resolution":"refund","buyerBank":{...}}`.

## API

```
POST /api/orders            create escrow order (returns checkoutLink, payUrl, virtual account)
GET  /api/orders/:id        order + audit trail
POST /api/orders/:id/ship
POST /api/orders/:id/confirm
POST /api/orders/:id/dispute      {"reason": "..."}
POST /api/orders/:id/resolve      {"resolution":"release"|"refund", "buyerBank":{accountNumber,bankCode,accountName}}
POST /webhooks/nomba        Nomba event sink (signed)
```

## Design decisions

- **Money in kobo, integers only.** No floating point in a ledger.
- **Webhook-first truth.** Synchronous API responses are treated as provisional; `payment_success` / `payout_success` are authoritative, exactly as Nomba's transfer docs recommend.
- **Idempotency everywhere.** Webhooks dedupe on `requestId`; transfers carry `merchantTxRef` + `X-Idempotent-key`.
- **Escrow that can't trap money.** If a buyer disappears after shipment, a sweep auto-releases after the configured window (default 72h).

## Business model

1.5% escrow fee on the vendor payout. Vendors pay for trust because trust converts first-time buyers; every order is two Nomba money movements (collection + payout).

## For reviewers

Live instance: https://maternal-roulette-catty.ngrok-free.dev (dev tunnel, kept online through judging)

To test the full flow: open the link above, create an order on the dashboard (any Nigerian bank details for payout, e.g. bank code 058), open the buyer link, and pay via the Nomba checkout. Payments are real naira on the hackathon production sub account, so use small amounts like N100. The signed payment_success webhook flips the order to FUNDED, marking shipped and confirming delivery triggers the Nomba transfer payout, and every completed escrow updates the vendor's public trust page at /v/{slug}.

To test locally without paying: clone, follow Run it above, then use node scripts/simulate-webhook.js LBX-XXXXXXXX to fire a correctly signed webhook (plus a duplicate and a forged one) at your local server. npm run test:signature self tests the HMAC implementation. Nomba credentials go in .env per .env.example; the hackathon webhook signing key is documented in the hackathon channel.