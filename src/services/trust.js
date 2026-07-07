/**
 * Lockbox Trust: every completed escrow becomes verifiable vendor reputation.
 * Vendors are identified by a stable slug derived from their payout identity
 * (bank code + account number), so no schema change is needed: stats are
 * aggregated live from the orders ledger, which cannot be faked because every
 * row is backed by Nomba-verified money movement.
 */
import crypto from "node:crypto";
import { q, one } from "../db.js";

export function vendorSlug(bankCode, accountNo) {
  return crypto.createHash("sha256").update(`${bankCode}|${accountNo}`).digest("hex").slice(0, 10);
}

export async function findVendorBySlug(slug) {
  const res = await q(
    `SELECT DISTINCT vendor_name, vendor_bank_code, vendor_account_no FROM orders`
  );
  for (const r of res.rows) {
    if (vendorSlug(r.vendor_bank_code, r.vendor_account_no) === slug) return r;
  }
  return null;
}

export async function vendorStats(bankCode, accountNo) {
  const s = await one(
    `SELECT
       COUNT(*)                                                    AS total_orders,
       COUNT(*) FILTER (WHERE status = 'RELEASED')                 AS released,
       COUNT(*) FILTER (WHERE status = 'REFUNDED')                 AS refunded,
       COUNT(*) FILTER (WHERE status IN ('DISPUTED','REFUNDING'))  AS open_disputes,
       COUNT(*) FILTER (WHERE disputed_at IS NOT NULL)             AS ever_disputed,
       COUNT(*) FILTER (WHERE status IN ('FUNDED','SHIPPED','DELIVERED','RELEASING')) AS active,
       COALESCE(SUM(amount_kobo) FILTER (WHERE status = 'RELEASED'), 0) AS released_volume_kobo,
       MIN(created_at)                                             AS first_order,
       AVG(EXTRACT(EPOCH FROM (shipped_at - funded_at)) / 3600)
         FILTER (WHERE shipped_at IS NOT NULL AND funded_at IS NOT NULL) AS avg_hours_to_ship
     FROM orders
     WHERE vendor_bank_code = $1 AND vendor_account_no = $2`,
    [bankCode, accountNo]
  );

  const released = Number(s.released);
  const refunded = Number(s.refunded);
  const closed = released + refunded;
  return {
    totalOrders: Number(s.total_orders),
    released,
    refunded,
    openDisputes: Number(s.open_disputes),
    everDisputed: Number(s.ever_disputed),
    active: Number(s.active),
    releasedVolumeKobo: Number(s.released_volume_kobo),
    firstOrder: s.first_order,
    avgHoursToShip: s.avg_hours_to_ship === null ? null : Number(s.avg_hours_to_ship),
    releaseRate: closed === 0 ? null : Math.round((released / closed) * 100),
  };
}

export async function vendorRecentReleases(bankCode, accountNo, limit = 8) {
  const res = await q(
    `SELECT id, description, amount_kobo, released_at FROM orders
     WHERE vendor_bank_code = $1 AND vendor_account_no = $2 AND status = 'RELEASED'
     ORDER BY released_at DESC LIMIT $3`,
    [bankCode, accountNo, limit]
  );
  return res.rows;
}