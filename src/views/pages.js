/**
 * Server-rendered UI. No build step, no framework: template strings only.
 * Visual identity: Nigerian banknote green + paper + brass. The signature
 * element is the "lock track": the escrow lifecycle rendered as a row of
 * padlocks that open as money moves.
 */
import { naira } from "../services/orders.js";

const STATES = ["CREATED", "FUNDED", "SHIPPED", "DELIVERED", "RELEASED"];
const STATE_LABEL = {
  CREATED: "Awaiting payment",
  FUNDED: "Money locked",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  RELEASING: "Paying vendor",
  RELEASED: "Vendor paid",
  DISPUTED: "In dispute",
  REFUNDING: "Refunding buyer",
  REFUNDED: "Refunded",
  EXPIRED: "Expired",
};

const css = `
:root{
  --ink:#0d2b1f;         /* bottle green, naira-note dark */
  --field:#11402d;
  --paper:#f6f3ec;       /* unbleached paper */
  --paper-dim:#e9e4d8;
  --brass:#c9a227;       /* padlock brass */
  --brass-dark:#9a7b1c;
  --red:#b3402f;
  --mono:"IBM Plex Mono","Courier New",monospace;
  --sans:"Inter","Segoe UI",system-ui,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--ink);color:var(--paper);font-family:var(--sans);min-height:100vh}
a{color:var(--brass)}
.wrap{max-width:880px;margin:0 auto;padding:28px 20px 60px}
header.site{display:flex;align-items:baseline;justify-content:space-between;border-bottom:1px solid var(--field);padding-bottom:14px;margin-bottom:28px}
.logo{font-family:var(--mono);font-size:1.3rem;letter-spacing:.12em;color:var(--paper)}
.logo b{color:var(--brass)}
.tag{font-size:.78rem;color:var(--paper-dim);opacity:.75}
h1{font-size:1.5rem;font-weight:600;margin-bottom:6px}
h2{font-size:1.05rem;font-weight:600;margin:26px 0 10px;color:var(--brass)}
p.lede{color:var(--paper-dim);max-width:52ch;line-height:1.5}
.card{background:var(--field);border:1px solid #1c5a40;border-radius:10px;padding:20px;margin-top:16px}
.money{font-family:var(--mono);font-size:1.9rem;color:var(--paper)}
.money small{font-size:.9rem;color:var(--paper-dim)}
label{display:block;font-size:.78rem;letter-spacing:.05em;text-transform:uppercase;color:var(--paper-dim);margin:12px 0 4px}
input,textarea,select{width:100%;padding:10px;border-radius:6px;border:1px solid #2a6b4e;background:var(--ink);color:var(--paper);font-family:var(--sans)}
button{cursor:pointer;margin-top:16px;background:var(--brass);color:var(--ink);border:none;border-radius:6px;padding:11px 18px;font-weight:700;font-family:var(--sans)}
button.secondary{background:transparent;color:var(--brass);border:1px solid var(--brass)}
button.danger{background:transparent;color:#e08a7c;border:1px solid var(--red)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
@media(max-width:640px){.grid2{grid-template-columns:1fr}}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:.9rem}
th{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--paper-dim);text-align:left;padding:8px 8px}
td{padding:10px 8px;border-top:1px solid #1c5a40;font-family:var(--mono);font-size:.85rem}
.pill{display:inline-block;padding:3px 10px;border-radius:99px;font-size:.72rem;font-family:var(--sans);font-weight:600;letter-spacing:.04em}
.pill.CREATED{background:#3a3a2c;color:#d8d2a8}
.pill.FUNDED{background:var(--brass);color:var(--ink)}
.pill.SHIPPED,.pill.DELIVERED,.pill.RELEASING{background:#22684a;color:#d5f2e2}
.pill.RELEASED{background:#d5f2e2;color:var(--ink)}
.pill.DISPUTED,.pill.REFUNDING{background:var(--red);color:#ffe3dc}
.pill.REFUNDED{background:#5c3a33;color:#ffd9d0}
/* Lock track */
.track{display:flex;align-items:center;gap:0;margin:22px 0 8px}
.track .node{display:flex;flex-direction:column;align-items:center;flex:1;position:relative}
.track .node::before{content:"";position:absolute;top:16px;left:-50%;width:100%;height:2px;background:#2a6b4e;z-index:0}
.track .node:first-child::before{display:none}
.track .node.done::before{background:var(--brass)}
.lock{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--ink);border:2px solid #2a6b4e;z-index:1;font-size:.95rem}
.node.done .lock{border-color:var(--brass);background:var(--brass);color:var(--ink)}
.node span{margin-top:6px;font-size:.68rem;color:var(--paper-dim);text-transform:uppercase;letter-spacing:.05em;text-align:center}
.node.done span{color:var(--brass)}
.banner{border:1px dashed var(--brass);border-radius:8px;padding:12px 14px;font-family:var(--mono);font-size:.85rem;margin-top:14px;word-break:break-all}
.evt{font-family:var(--mono);font-size:.78rem;color:var(--paper-dim);padding:6px 0;border-top:1px solid #1c5a40}
footer{margin-top:40px;font-size:.72rem;color:var(--paper-dim);opacity:.6}
`;

function layout(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Lockbox</title><style>${css}</style></head>
<body><div class="wrap">
<header class="site"><div class="logo">LOCK<b>BOX</b></div>
<div class="tag">escrow for social commerce · powered by Nomba</div></header>
${body}
<footer>Lockbox · DevCareer x Nomba Hackathon 2026 · funds held and moved on Nomba rails</footer>
</div></body></html>`;
}

function lockTrack(status) {
  const terminal = { RELEASING: "DELIVERED", RELEASED: "RELEASED", REFUNDING: "DISPUTED", REFUNDED: "DISPUTED", DISPUTED: "DISPUTED" };
  const effective = terminal[status] || status;
  const idx = STATES.indexOf(effective === "DISPUTED" ? "FUNDED" : effective);
  return `<div class="track">${STATES.map((s, i) => `
    <div class="node ${i <= idx ? "done" : ""}">
      <div class="lock">${i <= idx ? (s === "RELEASED" ? "&#128275;" : "&#10003;") : "&#128274;"}</div>
      <span>${STATE_LABEL[s]}</span>
    </div>`).join("")}</div>`;
}

export function homePage(orders) {
  const rows = orders.map((o) => `
    <tr><td><a href="/vendor/${o.id}">${o.id}</a></td>
    <td>${o.description.slice(0, 28)}</td>
    <td>&#8358;${naira(o.amount_kobo)}</td>
    <td><span class="pill ${o.status}">${STATE_LABEL[o.status] || o.status}</span></td></tr>`).join("");

  return layout("Vendor dashboard", `
  <h1>Sell to strangers without the fear.</h1>
  <p class="lede">Create an order, send your buyer one link. Their money locks in a Nomba-held account until they confirm delivery, then it lands in your bank instantly.</p>

  <div class="card">
    <h2 style="margin-top:0">New escrow order</h2>
    <form method="POST" action="/vendor/create">
      <label>What are you selling?</label>
      <input name="description" required placeholder="2 x Ankara gowns, size 12">
      <div class="grid2">
        <div><label>Price (&#8358;)</label><input name="amountNaira" required type="number" step="0.01" min="100" placeholder="25000"></div>
        <div><label>Buyer email</label><input name="buyerEmail" required type="email" placeholder="buyer@example.com"></div>
      </div>
      <h2>Your payout details</h2>
      <div class="grid2">
        <div><label>Business / vendor name</label><input name="vendorName" required placeholder="Ada Threads"></div>
        <div><label>Bank code (CBN)</label><input name="vendorBankCode" required placeholder="058 (GTBank)"></div>
        <div><label>Account number</label><input name="vendorAccountNo" required placeholder="0123456789"></div>
        <div><label>Account name</label><input name="vendorAccountName" required placeholder="ADA OBI"></div>
      </div>
      <button type="submit">Create order &amp; get payment link</button>
    </form>
  </div>

  <h2>Recent orders</h2>
  <table><tr><th>Order</th><th>Item</th><th>Amount</th><th>Status</th></tr>${rows || `<tr><td colspan="4">No orders yet.</td></tr>`}</table>`);
}

export function vendorOrderPage(o, events) {
  const shipBtn = o.status === "FUNDED" ? `<form method="POST" action="/vendor/${o.id}/ship"><button>Mark as shipped</button></form>` : "";
  return layout(`Order ${o.id}`, `
  <h1>${o.id} <span class="pill ${o.status}">${STATE_LABEL[o.status] || o.status}</span></h1>
  <p class="lede">${o.description}</p>
  ${lockTrack(o.status)}
  <div class="card">
    <div class="money">&#8358;${naira(o.amount_kobo)} <small>buyer pays</small></div>
    <div style="font-family:var(--mono);color:var(--paper-dim);margin-top:6px">
      you receive &#8358;${naira(Number(o.amount_kobo) - Number(o.fee_kobo))} after ${naira(o.fee_kobo)} escrow fee
    </div>
    <div class="banner">Buyer link (share on WhatsApp): <a href="/o/${o.id}">${o.id} payment page</a></div>
    ${o.virtual_account_no ? `<div class="banner">Or direct bank transfer: <b>${o.virtual_account_no}</b> · ${o.virtual_bank_name} · dedicated to this order only</div>` : ""}
    ${shipBtn}
  </div>
  <h2>Audit trail</h2>
  ${events.map((e) => `<div class="evt">${new Date(e.created_at).toISOString()} · ${e.from_state || "&#8709;"} &#8594; ${e.to_state} · ${e.actor}${e.note ? " · " + e.note : ""}</div>`).join("")}
  <p style="margin-top:20px"><a href="/">&#8592; dashboard</a></p>`);
}

export function buyerOrderPage(o) {
  let action = "";
  if (o.status === "CREATED") {
    action = `
      <a href="${o.checkout_link}"><button>Pay &#8358;${naira(o.amount_kobo)} securely</button></a>
      ${o.virtual_account_no ? `<div class="banner">Prefer bank transfer? Send exactly &#8358;${naira(o.amount_kobo)} to <b>${o.virtual_account_no}</b> (${o.virtual_bank_name}). This account exists only for this order.</div>` : ""}
      <p class="lede" style="margin-top:12px">Your money does not go to the seller yet. It locks with Lockbox until you confirm delivery.</p>`;
  } else if (o.status === "FUNDED") {
    action = `<p class="lede">Payment received and locked. Waiting for <b>${o.vendor_name}</b> to ship.</p>`;
  } else if (o.status === "SHIPPED") {
    action = `
      <p class="lede">The seller marked this as shipped. When it arrives and you are happy, release the money. If nothing arrives within ${o.auto_release_hours} hours, funds release automatically.</p>
      <form method="POST" action="/o/${o.id}/confirm"><button>I received it, release the money</button></form>
      <form method="POST" action="/o/${o.id}/dispute"><input name="reason" placeholder="What went wrong?" style="margin-top:14px"><button class="danger">Something is wrong, open a dispute</button></form>`;
  } else if (["DELIVERED", "RELEASING", "RELEASED"].includes(o.status)) {
    action = `<p class="lede">Delivery confirmed. ${o.status === "RELEASED" ? "The seller has been paid. Transaction complete." : "Paying the seller now."}</p>`;
  } else if (["DISPUTED", "REFUNDING", "REFUNDED"].includes(o.status)) {
    action = `<p class="lede">This order is ${STATE_LABEL[o.status].toLowerCase()}. Lockbox is holding the funds${o.status === "REFUNDED" ? " no longer; your refund has been sent" : " safely while this is resolved"}.</p>`;
  }

  return layout(`Pay ${o.id}`, `
  <h1>${o.vendor_name} <span class="pill ${o.status}">${STATE_LABEL[o.status] || o.status}</span></h1>
  <p class="lede">${o.description}</p>
  ${lockTrack(o.status)}
  <div class="card">
    <div class="money">&#8358;${naira(o.amount_kobo)}</div>
    ${action}
  </div>`);
}
