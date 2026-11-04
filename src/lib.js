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
const SUBSCRIPT = "\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089";
/** A price as production writes it: four significant digits, and a run of four or more leading zeros counted in a subscript (0.0\u20882791). */
export const price = (n) => {
  if (n == null) return "";
  const full = n.toLocaleString("en-US", n >= 1 ? { maximumFractionDigits: 2 } : { maximumSignificantDigits: 4, useGrouping: false });
  const run = /^0\.(0{4,})(\d+)$/.exec(full);
  return run ? `0.0${String(run[1].length).replace(/\d/g, (d) => SUBSCRIPT[d])}${run[2]}` : full;
};
/** A dollar amount: cents from a dollar up, as a broker shows a share's price; production's significant digits below. */
export const money = (n) => (n >= 1 ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : `$${price(n)}`);
export const pct = (bps) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 3 })}%`;
/** A change as a signed percentage and its direction; up to one decimal, or exactly `digits` (a stock's two). */
export const change = (c, digits) => c == null ? ["", ""] : [
  `${(c * 100).toLocaleString("en-US", digits == null ? { maximumFractionDigits: 1, signDisplay: "exceptZero" } : { minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: "exceptZero" })}%`,
  c > 0 ? "up" : c < 0 ? "down" : "",
];
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
/** A site path as an href: as it is, or, in a preview build (data-relative), relative and ending in index.html. */
export const link = (path) => {
  if (!html.dataset.relative) return `${base}${path}`;
  const [, dir, rest] = path.match(/^\/([^?#]*?)\/?([?#].*)?$/);
  return `${base}/${dir ? `${dir}/` : ""}index.html${rest ?? ""}`;
};

/** A coin's picture, or its first letter on the heat when it has none. */
export const tile = (image, symbol, cls = "tile") =>
  image ? `<img class="${cls}" src="${esc(image)}" alt="" loading="lazy">` : `<span class="${cls}" aria-hidden="true">${esc((symbol ?? "?").slice(0, 1))}</span>`;

/** A coin's picture with the asset it trades in as a badge on its corner: the pair, at a glance. */
export const pairTile = (image, symbol, quote, cls = "tile") =>
  `<span class="pair-tile">${tile(image, symbol, cls)}<span class="pair-badge" title="${esc(ticker(quote))}">${tile(quote?.logo, ticker(quote), "tile")}</span></span>`;

/** A pair as text: the coin in ink, the asset it trades in in the accent. */
export const pairName = (symbol, quote) => `${esc(symbol)}<span class="pair-quote">/${esc(ticker(quote))}</span>`;

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
  const watch = watched();
  const lead = compact ? "" : `<th scope="col" class="star-cell"><span class="visually-hidden">Watch</span></th>`;
  const extra = compact ? "" : `<th scope="col" class="r hide-sm">Curve</th><th scope="col" class="r hide-sm">Age</th>`;
  table.innerHTML = `
    <thead><tr>${lead}<th scope="col">Coin</th><th scope="col" class="r">Price</th><th scope="col" class="r">24h</th><th scope="col" class="hide-sm"><span class="visually-hidden">Trend</span></th><th scope="col" class="r hide-sm">Volume</th><th scope="col" class="r hide-sm">Market cap</th>${extra}</tr></thead>
    <tbody>${launches.map((l) => {
      const [c, dir] = change(l.market?.change24h);
      const q = ticker(l.quote);
      const share = Math.min(1, Number(l.curve.raised) / Number(l.graduationTarget));
      const curve = l.graduation ? `<span class="badge badge-gold">Graduated</span>` : `<span class="progress mini"><span style="--value:${(share * 100).toFixed(1)}%"></span></span>`;
      const star = compact ? "" : `<td class="star-cell"><button type="button" class="star" data-watch="${l.mint}" aria-pressed="${watch.has(l.mint)}" aria-label="Watch ${esc(l.symbol)}"></button></td>`;
      return `<tr>${star}
        <td><a class="cell-coin" href="${link(`/coin/?mint=${l.mint}`)}">${pairTile(l.image, l.symbol, l.quote)}<span><b>${pairName(l.symbol, l.quote)}</b><br><span>${esc(l.name)}</span></span></a></td>
        <td class="r">${l.market?.price != null ? `${price(l.market.price)} <span class="muted hide-sm">${esc(q)}</span>` : ""}</td>
        <td class="r ${dir}">${c}</td>
        <td class="hide-sm"><svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" data-spark="${l.mint}" aria-hidden="true"></svg></td>
        <td class="r hide-sm">${l.market?.volume24h?.sol ? `${short(l.market.volume24h.sol)} SOL` : ""}</td>
        <td class="r hide-sm">${l.market?.marketCap?.sol ? `${short(l.market.marketCap.sol)} SOL` : ""}</td>
        ${compact ? "" : `<td class="r hide-sm">${curve}</td><td class="r hide-sm muted">${ago(l.createdAt)}</td>`}
      </tr>`;
    }).join("")}</tbody>`;
  // One listener per table, set as a property so a re-render never adds a second.
  table.onclick = (e) => {
    const button = e.target.closest("[data-watch]");
    if (!button) return;
    button.setAttribute("aria-pressed", String(toggleWatch(button.dataset.watch)));
    table.dispatchEvent(new CustomEvent("watch", { bubbles: true }));
  };
  sparklines(table);
}

// Watchlist: a per-viewer convenience kept in this browser only; without storage the stars still toggle for the visit.
const WATCH_KEY = "stoker.watch";
let watchMemory = new Set();
export const watched = () => {
  try { return new Set(JSON.parse(localStorage.getItem(WATCH_KEY) ?? "[]")); } catch { return new Set(watchMemory); }
};
export function toggleWatch(mint) {
  const set = watched();
  if (set.has(mint)) set.delete(mint); else set.add(mint);
  watchMemory = set;
  try { localStorage.setItem(WATCH_KEY, JSON.stringify([...set])); } catch {}
  return set.has(mint);
}

/**
 * The last day as a line, from hourly candles: a coin's by default (`data-spark` holds its mint), or any series named by
 * `data-spark-path`. Each series is read once and kept for the visit.
 */
const sparkCache = new Map();
export async function sparklines(root, max = 20) {
  for (const svg of $$("[data-spark]", root).slice(0, max)) {
    const path = svg.dataset.sparkPath ?? `/v1/launches/${svg.dataset.spark}/candles?interval=1h`;
    if (!sparkCache.has(path)) sparkCache.set(path, read(path).then((d) => d?.candles.slice(-24).map((k) => k.close) ?? []));
    const closes = await sparkCache.get(path);
    if (closes.length < 2) continue;
    const lo = Math.min(...closes), hi = Math.max(...closes), span = hi - lo || 1;
    svg.innerHTML = `<polyline points="${closes.map((v, i) => `${(i / (closes.length - 1)) * 100},${26 - ((v - lo) / span) * 24}`).join(" ")}"/>`;
    svg.classList.add(closes.at(-1) >= closes[0] ? "up" : "down");
  }
}

/** A price line with a soft fill under it, scaled to the drawing; false, and an empty drawing, below two points. */
export function lineChart(svg, closes) {
  if (closes.length < 2) {
    svg.innerHTML = "";
    return false;
  }
  const lo = Math.min(...closes), hi = Math.max(...closes), span = hi - lo || 1;
  const pts = closes.map((v, i) => `${(i / (closes.length - 1)) * 100},${92 - ((v - lo) / span) * 84}`).join(" ");
  svg.innerHTML = `<defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".12"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    <polygon class="chart-fill" points="0,100 ${pts} 100,100"/><polyline class="chart-line" points="${pts}"/>`;
  return true;
}

// The US stock market ------------------------------------------------------
// The regular session of the NYSE and Nasdaq: 09:30 to 16:00 New York time on weekdays, shut on these holidays and
// closing at 13:00 on the early days, from the exchanges' published calendars. Extend both lists each year.
const US_HOLIDAYS = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);
const US_EARLY_CLOSES = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);
const OPENS = 9 * 60 + 30;
const newYork = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const inNewYork = (date) => {
  const p = Object.fromEntries(newYork.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday, minutes: Number(p.hour) * 60 + Number(p.minute) };
};
const isTradingDay = ({ date, weekday }) => weekday !== "Sat" && weekday !== "Sun" && !US_HOLIDAYS.has(date);

/** Whether the US market is open now, and when it next closes or opens, in New York time. */
export function usMarket(now = new Date()) {
  const today = inNewYork(now);
  const closes = US_EARLY_CLOSES.has(today.date) ? 13 * 60 : 16 * 60;
  if (isTradingDay(today) && today.minutes >= OPENS && today.minutes < closes) {
    return { open: true, next: `closes ${closes === 13 * 60 ? "13:00" : "16:00"} ET` };
  }
  // Calendar days from New York's today, each taken at midday UTC so a change of clocks never skips one.
  const [y, m, d] = today.date.split("-").map(Number);
  for (let i = 0; i < 14; i++) {
    const day = inNewYork(new Date(Date.UTC(y, m - 1, d + i, 17)));
    if (!isTradingDay(day) || (i === 0 && today.minutes >= OPENS)) continue;
    return { open: false, next: `opens ${i === 0 ? "" : `${day.weekday} `}09:30 ET` };
  }
  return { open: false, next: "" };
}

/** Fills a [data-hours] line with the US market's state beside Solana's, which never closes, and keeps it current. */
export function marketHours(el) {
  if (!el) return;
  const draw = () => {
    const us = usMarket();
    el.innerHTML = `<span><span class="dot ${us.open ? "dot-open" : ""}"></span><span>US market <b>${us.open ? "open" : "closed"}</b>${us.next ? `<span class="muted"> · ${us.next}</span>` : ""}</span></span>
      <span><span class="dot dot-open"></span><span>Solana <b>open</b></span></span>`;
  };
  draw();
  setInterval(draw, 60_000);
  show(el);
}

// "/" goes to search from anywhere: the page's own field, or Explore's.
document.addEventListener("keydown", (e) => {
  if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.target.closest("input, textarea, select, [contenteditable]")) return;
  e.preventDefault();
  const field = $("[data-search]");
  if (field) field.focus();
  else location.href = `${link("/coins")}#search`;
});
