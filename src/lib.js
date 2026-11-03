// The shared half of the site's script: where data comes from, how it is formatted, and the pieces several pages
// draw. app.js holds one renderer per page.
//
// Fills each page's live parts from Stoker's public API. Every page is complete without it: a part with nothing real
// behind it stays hidden, never a zero, a placeholder or an error.
//
// `?api=fixture` reads /fixture.json instead and is remembered for the visit; `?api=<origin>` reads another API;
// `?api=live` goes back to the real one. The page's renderer is picked by <body data-page>.

const html = document.documentElement;
const base = html.dataset.base ?? "";
const given = new URLSearchParams(location.search).get("api");
try { if (given) sessionStorage.setItem("api", given === "live" ? "" : given); } catch {}
const api = (() => { try { return sessionStorage.getItem("api") || html.dataset.api; } catch { return given || html.dataset.api; } })();
// The fixture's times are moved to now, so "8m ago" reads as it did when the fixture was written.
const fixture = api === "fixture"
  ? fetch(`${base}/fixture.json`).then((r) => r.text()).then((text) => {
      const offset = Date.now() - Date.parse(JSON.parse(text)._now);
      const iso = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/;
      return JSON.parse(text, (_, v) => (typeof v === "string" && iso.test(v) ? new Date(Date.parse(v) + offset).toISOString() : v));
    }).catch(() => ({}))
  : null;

/** One GET, as JSON, or null on any failure. Fixture keys are the path without its query. */
export async function read(path) {
  try {
    if (fixture) return (await fixture)[path.split("?")[0]] ?? null;
    const res = await fetch(`${api}${path}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Formatting ---------------------------------------------------------------
export const whole = (n) => n.toLocaleString("en-US");
export const short = (n) => n.toLocaleString("en-US", n >= 10_000 ? { notation: "compact", maximumSignificantDigits: 3 } : { maximumFractionDigits: n < 10 ? 2 : 0 });
export const price = (n) => n == null ? "" : n.toLocaleString("en-US", n >= 1 ? { maximumFractionDigits: 2 } : { maximumSignificantDigits: 4 });
export const pct = (bps) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 3 })}%`;
export const change = (c) => c == null ? ["", ""] : [`${(c * 100).toLocaleString("en-US", { maximumFractionDigits: 1, signDisplay: "exceptZero" })}%`, c > 0 ? "up" : c < 0 ? "down" : ""];
export const ago = (iso) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};
export const shortAddress = (a) => `${a.slice(0, 4)}…${a.slice(-4)}`;
export const ticker = (q) => q?.symbol ?? (q?.mint ? shortAddress(q.mint) : "");
export const day = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// DOM helpers --------------------------------------------------------------
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const show = (el) => { if (el) el.hidden = false; };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const link = (path) => `${base}${path}`;

/** A coin's picture, or its first letter on the heat when it has none. */
export const tile = (image, symbol, cls = "tile") =>
  image ? `<img class="${cls}" src="${esc(image)}" alt="" loading="lazy">` : `<span class="${cls}" aria-hidden="true">${esc((symbol ?? "?").slice(0, 1))}</span>`;

/** Fills a [data-figure] cell and shows it, with its section, only for a real, non-zero value. */
export function figure(key, value, unit) {
  const el = $(`[data-figure="${key}"]`);
  if (!el || !value) return;
  $("dd", el).innerHTML = `${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ""}`;
  show(el);
  show(el.closest("[data-live]"));
}

/** The coins table: the home page's five and Explore's board. `compact` leaves out the curve and the age. */
export function coinTable(table, launches, { compact = false } = {}) {
  const extra = compact ? "" : `<th scope="col" class="r hide-sm">Curve</th><th scope="col" class="r hide-sm">Age</th>`;
  table.innerHTML = `
    <thead><tr><th scope="col">Coin</th><th scope="col" class="r">Price</th><th scope="col" class="r">24h</th><th scope="col" class="r hide-sm">Volume</th><th scope="col" class="r hide-sm">Market cap</th>${extra}</tr></thead>
    <tbody>${launches.map((l) => {
      const [c, dir] = change(l.market?.change24h);
      const q = ticker(l.quote);
      const share = Math.min(1, Number(l.curve.raised) / Number(l.graduationTarget));
      const curve = l.graduation ? `<span class="badge badge-gold">Graduated</span>` : `<span class="progress mini"><span style="--value:${(share * 100).toFixed(1)}%"></span></span>`;
      return `<tr>
        <td><a class="cell-coin" href="${link(`/coin/?mint=${l.mint}`)}">${tile(l.image, l.symbol)}<span><b>${esc(l.symbol)}<span class="pair-quote">/${esc(q)}</span></b><br><span>${esc(l.name)}</span></span></a></td>
        <td class="r">${l.market?.price != null ? `${price(l.market.price)} <span class="muted hide-sm">${esc(q)}</span>` : ""}</td>
        <td class="r ${dir}">${c}</td>
        <td class="r hide-sm">${l.market?.volume24h?.sol ? `${short(l.market.volume24h.sol)} SOL` : ""}</td>
        <td class="r hide-sm">${l.market?.marketCap?.sol ? `${short(l.market.marketCap.sol)} SOL` : ""}</td>
        ${compact ? "" : `<td class="r hide-sm">${curve}</td><td class="r hide-sm muted">${ago(l.createdAt)}</td>`}
      </tr>`;
    }).join("")}</tbody>`;
}
