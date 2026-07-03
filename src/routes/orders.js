import { Router } from "express";
import {
  createOrder, getOrder, getOrderEvents, listOrders,
  markShipped, confirmDelivery, openDispute, resolveDispute, naira,
} from "../services/orders.js";
import { config } from "../config.js";

export const ordersRouter = Router();

function publicOrder(o) {
  if (!o) return null;
  return {
    id: o.id,
    status: o.status,
    description: o.description,
    amount: naira(o.amount_kobo),
    fee: naira(o.fee_kobo),
    vendorPayout: naira(Number(o.amount_kobo) - Number(o.fee_kobo)),
    currency: o.currency,
    vendorName: o.vendor_name,
    buyerEmail: o.buyer_email,
    checkoutLink: o.checkout_link,
    virtualAccount: o.virtual_account_no
      ? { accountNumber: o.virtual_account_no, bankName: o.virtual_bank_name, reference: o.virtual_account_ref }
      : null,
    payUrl: `${config.baseUrl}/o/${o.id}`,
    autoReleaseHours: o.auto_release_hours,
    timestamps: {
      created: o.created_at, funded: o.funded_at, shipped: o.shipped_at,
      delivered: o.delivered_at, released: o.released_at,
      disputed: o.disputed_at, refunded: o.refunded_at,
    },
    disputeReason: o.dispute_reason,
  };
}

ordersRouter.get("/", async (_req, res) => {
  res.json({ orders: (await listOrders()).map(publicOrder) });
});

ordersRouter.post("/", async (req, res) => {
  try {
    const b = req.body || {};
    for (const f of ["description", "amountNaira", "vendorName", "vendorBankCode", "vendorAccountNo", "vendorAccountName", "buyerEmail"]) {
      if (!b[f]) return res.status(400).json({ error: `missing field: ${f}` });
    }
    const order = await createOrder(b);
    res.status(201).json({ order: publicOrder(order) });
  } catch (err) {
    console.error("create order failed:", err);
    res.status(500).json({ error: err.message });
  }
});

ordersRouter.get("/:id", async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "not found" });
  res.json({ order: publicOrder(order), events: await getOrderEvents(order.id) });
});

ordersRouter.post("/:id/ship", async (req, res) => {
  const updated = await markShipped(req.params.id);
  if (!updated) return res.status(409).json({ error: "order must be FUNDED to ship" });
  res.json({ order: publicOrder(updated) });
});

ordersRouter.post("/:id/confirm", async (req, res) => {
  try {
    const order = await confirmDelivery(req.params.id);
    res.json({ order: publicOrder(order) });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

ordersRouter.post("/:id/dispute", async (req, res) => {
  try {
    const order = await openDispute(req.params.id, req.body?.reason || "No reason given");
    res.json({ order: publicOrder(order) });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

ordersRouter.post("/:id/resolve", async (req, res) => {
  try {
    const order = await resolveDispute(req.params.id, req.body?.resolution, req.body?.buyerBank);
    res.json({ order: publicOrder(order) });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});
