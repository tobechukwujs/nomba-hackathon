/**
 * Public trust page + shareable badge. Same banknote-green identity as the app.
 */
import { naira } from "../services/orders.js";

const css = `
:root{--ink:#0d2b1f;--field:#11402d;--paper:#f6f3ec;--paper-dim:#e9e4d8;--brass:#c9a227;--red:#b3402f;
--mono:"IBM Plex Mono","Courier New",monospace;--sans:"Inter","Segoe UI",system-ui,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--ink);color:var(--paper);font-family:var(--sans);min-height:100vh}
a{color:var(--brass)}
.wrap{max-width:760px;margin:0 auto;padding:28px 20px 60px}
header.site{display:flex;align-items:baseline;justify-content:space-between;border-bottom:1px solid var(--field);padding-bottom:14px;margin-bottom:28px}
.logo{font-family:var(--mono);font-size:1.3rem;letter-spacing:.12em}
.logo b{color:var(--brass)}
.tag{font-size:.78rem;color:var(--paper-dim);opacity:.75}
h1{font-size:1.6rem;margin-bottom:4px}
.verified{display:inline-flex;align-items:center;gap:6px;background:var(--brass);color:var(--ink);font-weight:700;font-size:.78rem;border-radius:99px;padding:4px 12px;margin-left:8px;vertical-align:middle}
p.lede{color:var(--paper-dim);line-height:1.5;margin-top:6px;max-width:56ch}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:24px}
.stat{background:var(--field);border:1px solid #1c5a40;border-radius:10px;padding:16px}
.stat .n{font-family:var(--mono);font-size:1.7rem}
.stat .n.brass{color:var(--brass)}
.stat .l{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--paper-dim);margin-top:4px}
h2{font-size:1rem;color:var(--brass);margin:30px 0 10px}
.rel{display:flex;justify-content:space-between;font-family:var(--mono);font-size:.85rem;padding:9px 0;border-top:1px solid #1c5a40;gap:12px}
.rel span:last-child{color:var(--paper-dim);white-space:nowrap}
.badgebox{background:var(--field);border:1px dashed var(--brass);border-radius:10px;padding:16px;margin-top:26px;font-family:var(--mono);font-size:.8rem;word-break:break-all}
footer{margin-top:40px;font-size:.72rem;color:var(--paper-dim);opacity:.6}
.empty{color:var(--paper-dim);font-size:.9rem;padding:10px 0}
`;

export function trustPage({ vendor, slug, stats, releases, baseUrl }) {
  const since = stats.firstOrder ? new Date(stats.firstOrder).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : null;
  const pageUrl = `${baseUrl}/v/${slug}`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${vendor.vendor_name} · Lockbox Trust</title><style>${css}</style></head>
<body><div class="wrap">
<header class="site"><div class="logo">LOCK<b>BOX</b> TRUST</div>
<div class="tag">reputation backed by real money movement</div></header>

<h1>${vendor.vendor_name}<span class="verified">&#128274; Lockbox verified</span></h1>
<p class="lede">Every number below is generated from completed escrow transactions on Nomba payment rails. It cannot be edited, bought, or faked${since ? `. Selling through Lockbox since ${since}` : ""}.</p>

<div class="stats">
  <div class="stat"><div class="n brass">${stats.released}</div><div class="l">escrows completed</div></div>
  <div class="stat"><div class="n">&#8358;${naira(stats.releasedVolumeKobo)}</div><div class="l">volume secured &amp; released</div></div>
  <div class="stat"><div class="n ${stats.releaseRate !== null && stats.releaseRate >= 90 ? "brass" : ""}">${stats.releaseRate === null ? "&#8212;" : stats.releaseRate + "%"}</div><div class="l">buyer release rate</div></div>
  <div class="stat"><div class="n">${stats.everDisputed}</div><div class="l">disputes ever raised</div></div>
  <div class="stat"><div class="n">${stats.active}</div><div class="l">escrows in progress</div></div>
  <div class="stat"><div class="n">${stats.avgHoursToShip === null ? "&#8212;" : stats.avgHoursToShip.toFixed(1) + "h"}</div><div class="l">avg time to ship</div></div>
</div>

<h2>Recent completed escrows</h2>
${releases.length ? releases.map((r) => `
  <div class="rel"><span>${r.description.slice(0, 40)} · &#8358;${naira(r.amount_kobo)}</span>
  <span>${new Date(r.released_at).toLocaleDateString("en-GB")}</span></div>`).join("")
  : `<div class="empty">No completed escrows yet. The first release starts the record.</div>`}

<div class="badgebox">
  Share this trust page: ${pageUrl}<br><br>
  Badge for your Instagram bio / website:<br>
  <img src="/v/${slug}/badge.svg" alt="Lockbox trust badge" style="margin-top:8px">
</div>

<footer>Lockbox Trust · escrow and reputation on Nomba rails · DevCareer x Nomba Hackathon 2026</footer>
</div></body></html>`;
}

export function trustBadgeSvg({ vendorName, released, releaseRate }) {
  const name = vendorName.length > 22 ? vendorName.slice(0, 21) + "…" : vendorName;
  const line2 = `${released} escrows completed${releaseRate !== null ? ` · ${releaseRate}% released` : ""}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="64" role="img" aria-label="Lockbox trust badge">
  <rect width="320" height="64" rx="10" fill="#0d2b1f" stroke="#c9a227" stroke-width="1.5"/>
  <text x="16" y="26" font-family="Courier New,monospace" font-size="14" fill="#f6f3ec" font-weight="bold">&#128274; ${name}</text>
  <text x="16" y="46" font-family="Segoe UI,sans-serif" font-size="12" fill="#c9a227">${line2}</text>
  <text x="304" y="46" text-anchor="end" font-family="Courier New,monospace" font-size="10" fill="#e9e4d8" opacity="0.7">LOCKBOX</text>
</svg>`;
}