-- Lockbox schema
-- Money is stored in kobo (integer) to avoid floating point drift.

CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,                -- lockbox order id, also used as Nomba orderReference
  status          TEXT NOT NULL DEFAULT 'CREATED', -- CREATED | FUNDED | SHIPPED | DELIVERED | RELEASING | RELEASED | DISPUTED | REFUNDING | REFUNDED | EXPIRED
  description     TEXT NOT NULL,
  amount_kobo     BIGINT NOT NULL CHECK (amount_kobo > 0),
  fee_kobo        BIGINT NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'NGN',

  -- vendor (seller)
  vendor_name          TEXT NOT NULL,
  vendor_phone         TEXT,
  vendor_bank_code     TEXT NOT NULL,
  vendor_account_no    TEXT NOT NULL,
  vendor_account_name  TEXT NOT NULL,

  -- buyer
  buyer_email     TEXT NOT NULL,
  buyer_phone     TEXT,

  -- Nomba references
  checkout_link         TEXT,
  nomba_order_reference TEXT UNIQUE,
  virtual_account_ref   TEXT UNIQUE,
  virtual_account_no    TEXT,
  virtual_bank_name     TEXT,
  payment_tx_id         TEXT,      -- Nomba transactionId that funded this order
  payout_tx_ref         TEXT,      -- merchantTxRef of the release/refund transfer
  payout_tx_id          TEXT,      -- Nomba transfer id

  auto_release_hours INT NOT NULL DEFAULT 72,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  funded_at    TIMESTAMPTZ,
  shipped_at   TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  released_at  TIMESTAMPTZ,
  disputed_at  TIMESTAMPTZ,
  refunded_at  TIMESTAMPTZ,
  dispute_reason TEXT
);

-- Every inbound Nomba webhook, exactly once. requestId is Nomba's unique message id,
-- so a duplicate delivery (their retry policy) becomes a no-op INSERT conflict.
CREATE TABLE IF NOT EXISTS webhook_events (
  request_id  TEXT PRIMARY KEY,
  event_type  TEXT NOT NULL,
  order_id    TEXT REFERENCES orders(id),
  payload     JSONB NOT NULL,
  signature_ok BOOLEAN NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Full audit trail of state transitions. This is what you show judges.
CREATE TABLE IF NOT EXISTS order_events (
  id         BIGSERIAL PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id),
  from_state TEXT,
  to_state   TEXT NOT NULL,
  actor      TEXT NOT NULL,   -- 'vendor' | 'buyer' | 'nomba_webhook' | 'system'
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);
