import { Router } from "express";
import {
  createOrder, getOrder, getOrderEvents, listOrders,
  markShipped, confirmDelivery, openDispute,
} from "../services/orders.js";
import { homePage, vendorOrderPage, buyerOrderPage } from "../views/pages.js";
import { vendorSlug, findVendorBySlug, vendorStats, vendorRecentReleases } from "../services/trust.js";
import { trustPage, trustBadgeSvg } from "../views/trust.js";
import { config } from "../config.js";

export const pagesRouter = Router();

// --- Lockbox Trust: public vendor reputation ---
pagesRouter.get("/v/:slug", async (req, res) => {
  const vendor = await findVendorBySlug(req.params.slug);
  if (!vendor) return res.status(404).send("Vendor not found");
  const stats = await vendorStats(vendor.vendor_bank_code, vendor.vendor_account_no);
  const releases = await vendorRecentReleases(vendor.vendor_bank_code, vendor.vendor_account_no);
  res.send(trustPage({ vendor, slug: req.params.slug, stats, releases, baseUrl: config.baseUrl }));
});

pagesRouter.get("/v/:slug/badge.svg", async (req, res) => {
  const vendor = await findVendorBySlug(req.params.slug);
  if (!vendor) return res.status(404).send("Not found");
  const stats = await vendorStats(vendor.vendor_bank_code, vendor.vendor_account_no);
  res.set("Content-Type", "image/svg+xml");
  res.send(trustBadgeSvg({ vendorName: vendor.vendor_name, released: stats.released, releaseRate: stats.releaseRate }));
});

pagesRouter.get("/", async (_req, res) => {
  res.send(homePage(await listOrders()));
});

pagesRouter.post("/vendor/create", async (req, res) => {
  try {
    const order = await createOrder(req.body);
    res.redirect(`/vendor/${order.id}`);
  } catch (err) {
    res.status(500).send(`<pre>Order creation failed: ${err.message}\n\nGo back and retry.</pre>`);
  }
});

pagesRouter.get("/vendor/:id", async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).send("Order not found");
  const slug = vendorSlug(order.vendor_bank_code, order.vendor_account_no);
  res.send(vendorOrderPage(order, await getOrderEvents(order.id), slug));
});

pagesRouter.post("/vendor/:id/ship", async (req, res) => {
  await markShipped(req.params.id);
  res.redirect(`/vendor/${req.params.id}`);
});

pagesRouter.get("/o/:id", async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).send("Order not found");
  res.send(buyerOrderPage(order));
});

pagesRouter.post("/o/:id/confirm", async (req, res) => {
  try {
    await confirmDelivery(req.params.id);
  } catch (err) {
    console.error(err.message);
  }
  res.redirect(`/o/${req.params.id}`);
});

pagesRouter.post("/o/:id/dispute", async (req, res) => {
  try {
    await openDispute(req.params.id, req.body?.reason || "No reason given");
  } catch (err) {
    console.error(err.message);
  }
  res.redirect(`/o/${req.params.id}`);
});
