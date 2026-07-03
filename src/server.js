import express from "express";
import { config } from "./config.js";
import { ordersRouter } from "./routes/orders.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { pagesRouter } from "./routes/pages.js";
import { autoReleaseSweep } from "./services/orders.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "lockbox", time: new Date().toISOString() }));

app.use("/api/orders", ordersRouter);
app.use("/webhooks", webhooksRouter);
app.use("/", pagesRouter);

// Auto-release: escrow that never traps money. Sweep every 5 minutes.
setInterval(() => autoReleaseSweep().catch((e) => console.error("sweep:", e.message)), 5 * 60_000);

app.listen(config.port, () => {
  console.log(`Lockbox listening on :${config.port}`);
  console.log(`Webhook URL to register with Nomba: ${config.baseUrl}/webhooks/nomba`);
});
