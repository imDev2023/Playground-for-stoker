// Fills the page's live parts from Stoker's public API. The HTML is complete without it: a read that fails leaves its
// part hidden, never a zero or an error. `?api=fixture` reads ./fixture.json instead; `?api=<origin>` reads another API.

const param = new URLSearchParams(location.search).get("api");
const api = param ?? document.documentElement.dataset.api;

const read = async (path) => {
  try {
    const res = await fetch(api === "fixture" ? "fixture.json" : `${api}${path}`);
    if (!res.ok) return null;
    const body = await res.json();
    return api === "fixture" ? body[path] ?? null : body;
  } catch {
    return null;
  }
};

const whole = (n) => n.toLocaleString("en-US");
const compact = (n) => n.toLocaleString("en-US", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: n < 10 ? 2 : 0, maximumSignificantDigits: n >= 10_000 ? 3 : undefined });

function figure(key, value, unit) {
  if (!value) return;
  const el = document.querySelector(`[data-figure="${key}"]`);
  el.querySelector("dd").textContent = value;
  if (unit) el.querySelector("dd").append(Object.assign(document.createElement("small"), { textContent: unit }));
  el.hidden = false;
  document.querySelector("[data-figures]").hidden = false;
}

function change(c) {
  if (c == null) return ["", ""];
  const pct = (c * 100).toLocaleString("en-US", { maximumFractionDigits: 1, signDisplay: "exceptZero" });
  return [`${pct}%`, c > 0 ? "up" : c < 0 ? "down" : ""];
}

function trending(launches) {
  if (!launches?.length) return;
  const template = document.querySelector("[data-row]");
  const rows = launches.slice(0, 5).map((l) => {
    const li = template.content.cloneNode(true);
    li.querySelector(".row").href = `https://stoker.markets/coin/${l.mint}`;
    const img = li.querySelector(".row-img");
    if (l.image) img.src = l.image;
    else img.replaceWith(Object.assign(document.createElement("span"), { className: "row-img", textContent: l.symbol.slice(0, 1) }));
    li.querySelector(".row-name").textContent = l.name;
    li.querySelector(".row-pair").textContent = `${l.symbol}/${l.quote.symbol ?? "?"}`;
    const [text, dir] = change(l.market?.change24h);
    const el = li.querySelector(".row-change");
    el.textContent = text;
    if (dir) el.dataset.dir = dir;
    return li;
  });
  document.querySelector("[data-rows]").replaceChildren(...rows);
  document.querySelector("[data-trending]").hidden = false;
}

const [quotes, stats, launches] = await Promise.all([
  read("/v1/quotes"),
  read("/v1/stats"),
  read("/v1/launches?sort=trending&limit=5"),
]);

const assets = quotes?.quotes.filter((q) => q.launchable).length ?? 0;
figure("assets", assets && whole(assets));
figure("launches", stats?.launches && whole(stats.launches));
figure("graduated", stats?.graduated && whole(stats.graduated));
figure("volume", stats?.volume24h.sol && compact(stats.volume24h.sol), "SOL");
if (assets) document.querySelector("[data-asset-count]").textContent = `All ${whole(assets)}`;
trending(launches?.launches);
