// One renderer per page, picked by <body data-page>. Each fills what the API answers and leaves the rest hidden.
import {
  read, $, $$, show, esc, link, whole, short, price, money, pct, change, ago, shortAddress, ticker, day, tile, pairTile, pairName, coinTable, figure, watched,
  sparklines, lineChart, usMarket, marketHours,
} from "./lib.js";

const params = new URLSearchParams(location.search);
const sol = (lamports) => Number(lamports) / 1e9;
const units = (raw, decimals) => Number(raw) / 10 ** decimals;
const solscan = (kind, id) => `https://solscan.io/${kind}/${id}`;
const checked = (name) => $(`input[name="${name}"]:checked`)?.value;

/** A row of chips that filters a list: All first, then each value present; left out when there is only one value. */
function filterChips(el, name, entries, onChange) {
  if (entries.length < 2) return;
  el.innerHTML = [["all", "All"], ...entries].map(([value, label], i) =>
    `<label class="chip chip-pick"><input type="radio" name="${name}" value="${value}"${i ? "" : " checked"}>${esc(label)}</label>`).join("");
  el.addEventListener("change", onChange);
  show(el);
}

const KINDS = { sol: "Solana", stablecoin: "Currencies", tokenized_stock: "Stocks", wrapped: "Wrapped", defi: "DeFi", rwa: "Real-world assets", leveraged: "Leverage", collectible: "Collectibles", meme: "Memes", community: "Community" };
const kindChips = (el, categories, onChange) =>
  filterChips(el, "kind", Object.keys(KINDS).filter((k) => categories.includes(k)).map((k) => [k, KINDS[k]]), onChange);

/** The stock issuers by the ids the API gives them, in production's order. */
const ISSUERS = { xstocks: "xStocks", prestocks: "PreStocks", tessera: "Tessera", backpack: "Backpack" };

/** An asset's risk labels as a list, each with its detail and where it was read; a plain line when there is nothing to flag. */
const labelList = (a) =>
  a.labels === null
    ? `<li><p>${esc(a.symbol)} has not been checked yet.</p></li>`
    : a.labels.length
      ? a.labels.map((x) => `<li><span class="badge ${x.severity === "caution" ? "badge-warn" : ""}">${esc(x.title)}</span><p>${esc(x.detail)}</p><p class="note">${esc(x.source)}</p></li>`).join("")
      : `<li><p>Nothing to flag: no issuer authority over wallets, no transfer fee, and on the verified list.</p></li>`;

/** A stock token's price against the stock it tracks, from the stock's last price; wide from 1% either way. */
const gap = (s) => {
  const last = s.market?.last?.price;
  const usd = Number(s.price?.usd);
  if (!last || !usd) return { text: "", wide: false };
  const value = usd / last - 1;
  return { text: `${(value * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" })}%`, wide: Math.abs(value) >= 0.01 };
};

const pages = {};

pages.index = async () => {
  const [quotes, stats, launches] = await Promise.all([read("/v1/quotes"), read("/v1/stats"), read("/v1/launches?sort=trending&limit=5")]);
  const assets = quotes?.quotes.filter((q) => q.launchable).length;
  figure("assets", assets && whole(assets));
  figure("launches", stats?.launches && whole(stats.launches));
  figure("graduated", stats?.graduated && whole(stats.graduated));
  figure("volume", stats?.volume24h?.sol && short(stats.volume24h.sol), "SOL");
  if (launches?.launches.length) {
    coinTable($("[data-coins]"), launches.launches.slice(0, 5), { compact: true });
    show($('[data-live="trending"]'));
  }
};

pages.coins = async () => {
  const data = await read("/v1/launches?sort=market_cap&limit=100");
  const all = data?.launches ?? [];
  const table = $("[data-coins]");
  const sorters = {
    market_cap: (a, b) => (b.market?.marketCap?.sol ?? 0) - (a.market?.marketCap?.sol ?? 0),
    new: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    trending: (a, b) => (b.market?.volume24h?.sol ?? 0) - (a.market?.volume24h?.sol ?? 0),
    graduation: (a, b) => (a.graduation ? 1 : 0) - (b.graduation ? 1 : 0) || Number(b.curve.raised) / Number(b.graduationTarget) - Number(a.curve.raised) / Number(a.graduationTarget),
  };
  const render = () => {
    const q = $("[data-search]").value.trim().toLowerCase();
    const kind = checked("kind") ?? "all";
    const onlyWatched = $("[data-watchlist]").checked;
    const watch = watched();
    const rows = all
      .filter((l) => !q || [l.name, l.symbol, l.mint].some((s) => s.toLowerCase().includes(q)))
      .filter((l) => kind === "all" || l.quote.category === kind)
      .filter((l) => !onlyWatched || watch.has(l.mint))
      .sort(sorters[checked("sort")]);
    coinTable(table, rows);
    $('[data-live="board"]').hidden = rows.length === 0;
    $("[data-empty]").hidden = rows.length > 0 || all.length === 0;
    $("[data-empty-text]").textContent = onlyWatched && !watch.size ? "Star a coin to watch it." : "Nothing matches.";
  };
  if (location.hash === "#search") $("[data-search]").focus();
  if (!all.length) return;
  kindChips($("[data-kinds]"), [...new Set(all.map((l) => l.quote.category))], render);
  $("[data-search]").addEventListener("input", render);
  $("[data-sort]").addEventListener("change", render);
  $("[data-watchlist]").addEventListener("change", render);
  // Unstarring a coin while the watchlist is shown takes it off the list.
  table.addEventListener("watch", () => { if ($("[data-watchlist]").checked) render(); });
  render();
};

pages.coin = async () => {
  const mint = params.get("mint");
  const [l, platform, trust, holders, quotes] = mint
    ? await Promise.all([read(`/v1/launches/${mint}`), read("/v1/platform"), read(`/v1/launches/${mint}/trust`), read(`/v1/launches/${mint}/holders`), read("/v1/quotes")])
    : [];
  if (!l) return show($("[data-empty]"));
  const q = ticker(l.quote);
  document.title = `${l.symbol} / ${q} · Stoker`;
  $("[data-coin-tile]").outerHTML = pairTile(l.image, l.symbol, l.quote, "tile tile-lg");
  $("[data-coin-pair]").innerHTML = pairName(l.symbol, l.quote);

  // Before you buy: what the Creator holds, who sniped the launch, and how much the ten largest wallets hold.
  const marks = [];
  if (holders) {
    const c = holders.creator;
    marks.push(c.status === "holding" ? ["ok", `Creator ${(c.share * 100).toFixed(1)}%`] : c.status === "sold" ? ["down", "Creator sold"] : ["none", "Creator 0%"]);
  }
  if (trust) {
    const n = trust.snipers.wallets.length;
    marks.push(n === 0 ? ["ok", "No snipers"] : ["caution", `${n} sniper${n === 1 ? "" : "s"}`]);
  }
  if (holders) {
    const top = holders.holders.filter((h) => h.kind !== "curve" && h.kind !== "pool").slice(0, 10).reduce((s, h) => s + h.share, 0);
    marks.push([top > 0.5 ? "caution" : "ok", `Top 10 ${(top * 100).toFixed(1)}%`]);
  }
  if (marks.length) {
    $("[data-marks]").innerHTML = marks.map(([tone, text]) => `<li class="mark-${tone}">${esc(text)}</li>`).join("");
    show($("[data-marks]"));
  }

  // The asset it trades in, with its risk labels.
  const asset = quotes?.quotes.find((x) => x.mint === l.quote.mint);
  if (asset) {
    const card = $("[data-quote-card]");
    card.href = link(`/asset/?mint=${asset.mint}`);
    $("[data-quote-tile]").outerHTML = tile(asset.logo, asset.symbol, "tile asset-tile");
    $("[data-quote-symbol]").textContent = `Paired with ${asset.symbol}`;
    $("[data-quote-kind]").textContent = asset.name;
    const cautions = (asset.labels ?? []).filter((x) => x.severity === "caution").length;
    const labels = $("[data-quote-labels]");
    labels.textContent = asset.labels === null ? "Not checked yet" : cautions ? `${cautions} risk label${cautions === 1 ? "" : "s"}` : "No risk labels";
    if (cautions) labels.classList.add("badge-warn");
    $("[data-quote-facts]").innerHTML = [
      [`1 ${esc(asset.symbol)}`, asset.price?.usd ? money(Number(asset.price.usd)) : ""],
      ["Liquidity", asset.liquidityUsd ? `$${short(asset.liquidityUsd)}` : ""],
      ["Graduates at", asset.graduationTarget ? `${short(units(asset.graduationTarget.raw, asset.decimals))} ${esc(asset.symbol)}` : ""],
    ].filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    show(card);
  }
  $("[data-coin-name]").innerHTML = `${esc(l.name)} · <a class="link" href="${solscan("token", l.mint)}">Explorer</a>`;
  $("[data-coin-price]").textContent = l.market?.price != null ? `${price(l.market.price)} ${q}` : "";
  const [c, dir] = change(l.market?.change24h);
  Object.assign($("[data-coin-change]"), { textContent: c, className: dir });
  $("[data-coin-cap]").textContent = l.market?.marketCap ? `${short(l.market.marketCap.quote)} ${q}` : "";
  $("[data-coin-vol]").textContent = l.market?.volume24h ? `${short(l.market.volume24h.quote)} ${q}` : "";

  // Graduation.
  const raised = units(l.curve.raised, l.quote.decimals);
  const target = units(l.graduationTarget, l.quote.decimals);
  const share = l.graduation ? 1 : Math.min(1, raised / target);
  $("[data-curve-pct]").innerHTML = l.graduation ? `<span class="badge badge-gold">Graduated</span>` : `${Math.round(share * 100)}%`;
  $("[data-curve-bar]").style.setProperty("--value", `${share * 100}%`);
  $("[data-curve-note]").textContent = l.graduation
    ? "Trades in its own Raydium pool, liquidity locked."
    : `${short(raised)} of ${short(target)} ${q} raised.`;

  // Chart.
  const chart = async (interval) => {
    const data = await read(`/v1/launches/${l.mint}/candles?interval=${interval}`);
    lineChart($("[data-chart]"), data?.candles.map((k) => k.close) ?? []);
  };
  $("[data-interval]").addEventListener("change", () => chart(checked("iv")));
  chart("15m");

  // Trades and holders.
  const activity = async () => {
    const table = $("[data-activity]");
    if (checked("tab") === "holders") {
      const h = await read(`/v1/launches/${l.mint}/holders`);
      const label = { curve: "Curve", pool: "Raydium pool", creator: "Creator", treasury: "Treasury", operations: "Operations" };
      table.innerHTML = h ? `<thead><tr><th>#</th><th>Wallet</th><th class="r">Share</th></tr></thead><tbody>${h.holders.map((x, i) =>
        `<tr><td class="muted">${i + 1}</td><td><a class="link" href="${solscan("account", x.owner)}">${shortAddress(x.owner)}</a> ${label[x.kind] ? `<span class="badge">${label[x.kind]}</span>` : ""}</td><td class="r">${(x.share * 100).toFixed(2)}%</td></tr>`).join("")}</tbody>` : "";
    } else {
      const t = await read(`/v1/launches/${l.mint}/trades`);
      table.innerHTML = t?.trades.length ? `<thead><tr><th>Side</th><th class="r">${esc(l.symbol)}</th><th class="r">${esc(q)}</th><th>Trader</th><th class="r">Time</th></tr></thead><tbody>${t.trades.map((x) =>
        `<tr><td class="${x.side === "buy" ? "up" : "down"}">${x.side === "buy" ? "Buy" : "Sell"}</td><td class="r">${short(units(x.baseAmount, 6))}</td><td class="r">${price(units(x.quoteAmount, l.quote.decimals))}</td><td><a class="link" href="${solscan("account", x.trader)}">${shortAddress(x.trader)}</a></td><td class="r"><a class="link" href="${solscan("tx", x.signature)}">${ago(x.time)}</a></td></tr>`).join("")}</tbody>` : "";
    }
  };
  $("[data-tabs]").addEventListener("change", activity);
  activity();

  // Trade panel: the estimate is the price less the fees the curve or pool charges; the review comes from the wallet.
  const fees = platform && (l.graduation ? platform.poolCreatorFeeBps + platform.raydiumFee.poolBps : platform.platformFeeBps + platform.creatorFeeBps + platform.raydiumFee.curveBps);
  const side = () => checked("side");
  const presets = () => {
    const sell = side() === "sell";
    $("[data-pay-token]").textContent = sell ? l.symbol : q;
    $("[data-presets]").innerHTML = (sell ? ["25%", "50%", "All"] : ticker(l.quote) === "SOL" ? ["0.1", "0.5", "1"] : []).map((v) => `<button type="button">${v}</button>`).join("");
    $("[data-presets]").hidden = !$("[data-presets]").children.length;
    estimate();
  };
  const estimate = () => {
    const amount = Number($("[data-amount]").value.replace(/,/g, ""));
    const p = l.market?.price;
    const ok = amount > 0 && p && fees != null;
    $("[data-estimate]").hidden = !ok;
    if (!ok) return;
    const net = amount * (1 - fees / 10_000);
    const floor = 1 - Number(checked("slip")) / 10_000;
    const buy = side() === "buy";
    $("[data-get]").textContent = buy ? `${short(net / p)} ${l.symbol}` : `${price(net * p)} ${q}`;
    $("[data-min]").textContent = buy ? `${short((net / p) * floor)} ${l.symbol}` : `${price(net * p * floor)} ${q}`;
    $("[data-fees]").textContent = pct(fees);
  };
  $("[data-trade]").addEventListener("change", presets);
  $("[data-amount]").addEventListener("input", estimate);
  $("[data-presets]").addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") return;
    const v = e.target.textContent;
    $("[data-amount]").value = v.endsWith("%") || v === "All" ? "" : v;
    estimate();
  });
  presets();

  // About.
  if (l.description) $("[data-coin-desc]").textContent = l.description; else $("[data-coin-desc]").remove();
  const facts = [
    ["Launch type", l.rewardTax ? `Reward Launch, ${pct(l.rewardTax.bps)}` : "Standard"],
    ["Creator earns", `<a class="link" href="${link("/fees")}">Half of what we collect</a>`],
    ["Launched", day(l.createdAt)],
    ...(l.graduation ? [["Graduated", day(l.graduation.graduatedAt)]] : []),
    ["Protected until", day(l.protection.until)],
    ["Creator", `<a class="link" href="${solscan("account", l.creator)}">${shortAddress(l.creator)}</a>`],
    ["Coin", `<a class="link" href="${solscan("token", l.mint)}">${shortAddress(l.mint)}</a>`],
    ...Object.entries(l.links ?? {}).filter(([, v]) => v).map(([k, v]) => [{ telegram: "Telegram", x: "X", website: "Website" }[k] ?? k, `<a class="link" href="${esc(v)}">${esc(v.replace(/^https?:\/\//, ""))}</a>`]),
  ];
  $("[data-coin-facts]").innerHTML = facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  show($('[data-live="coin"]'));
};

pages.launch = async () => {
  const [quoteList, platform] = await Promise.all([read("/v1/quotes"), read("/v1/platform")]);
  const quotes = quoteList?.quotes.filter((q) => q.launchable) ?? [];
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  const dollars = (bps) => `$${((bps / 10_000) * 1000).toFixed(2)}`;
  const other = $("[data-other]");
  if (quotes.length > 3) {
    other.innerHTML = `<option value="">Choose</option>` + quotes.filter((q) => !["SOL", "USDC", "NVDAx"].includes(q.symbol)).map((q) => `<option>${esc(q.symbol)}</option>`).join("");
    show($("[data-more-pairs]"));
  }
  const update = () => {
    const quote = other.value || checked("quote");
    const sym = $("[data-ticker]").value.trim().toUpperCase() || "TICKER";
    const type = checked("type");
    $("[data-preview-tile]").textContent = sym.slice(0, 1);
    $("[data-preview-pair]").innerHTML = `${esc(sym)}<span class="pair-quote">/${esc(quote)}</span>`;
    // Where the money goes on the curve, from the fees the chain has now: the Creator's half, the holders' tax, the rest.
    if (platform) {
      const tax = type === "standard" ? 0 : Number(checked("tax")) * 100;
      const rows = [
        ["To you", dollars(platform.creatorForward.curveBps + platform.creatorFeeBps)],
        ...(tax ? [["To holders", dollars(tax)]] : []),
        ["To the platform", dollars(platform.platformFeeBps - platform.creatorForward.curveBps)],
        ["To Raydium", dollars(platform.raydiumFee.curveBps)],
      ];
      $("[data-flow-rows]").innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
      show($("[data-flow]"));
    }
    $("[data-preview-name]").textContent = $("[data-name]").value.trim() || "Your coin";
    $("[data-quote-name]").textContent = quote;
    $("[data-first-token]").textContent = quote;
    $("[data-tax]").hidden = type === "standard";
    $("[data-preview-type]").textContent = type === "standard" ? "Standard" : `Reward Launch, ${checked("tax")}%`;
    const q = bySymbol.get(quote);
    $("[data-preview-target]").textContent = q?.graduationTarget ? `${short(units(q.graduationTarget.raw, q.decimals))} ${quote} raised` : "";
  };
  other.addEventListener("change", () => { if (other.value) $$('input[name="quote"]').forEach((i) => (i.checked = false)); update(); });
  $$('input[name="quote"]').forEach((i) => i.addEventListener("change", () => { other.value = ""; }));
  $("[data-launch]").addEventListener("input", update);
  $("[data-launch]").addEventListener("change", update);
  // An asset page's "Stoke a coin paired with" link names the asset by mint.
  const chosen = quotes.find((q) => q.mint === params.get("quote"));
  if (chosen) {
    const card = $(`input[name="quote"][value="${chosen.symbol}"]`);
    if (card) card.checked = true;
    else { other.value = chosen.symbol; $$('input[name="quote"]').forEach((i) => (i.checked = false)); }
  }
  update();
};

pages.assets = async () => {
  const quotes = (await read("/v1/quotes"))?.quotes ?? [];
  if (!quotes.length) return;
  const table = $("[data-assets]");
  const render = () => {
    const q = $("[data-search]").value.trim().toLowerCase();
    const kind = checked("kind") ?? "all";
    const rows = quotes.filter((a) => (kind === "all" || a.category === kind) && (!q || [a.symbol, a.name, a.mint].some((s) => s?.toLowerCase().includes(q))));
    const groups = Object.keys(KINDS).map((k) => [k, rows.filter((a) => a.category === k)]).filter(([, r]) => r.length);
    table.innerHTML = `<thead><tr><th>Asset</th><th class="r">Price</th><th class="r">Liquidity</th><th class="r">Graduates at</th></tr></thead>` + groups.map(([k, r]) =>
      `<tbody><tr class="group"><th colspan="4">${KINDS[k]}</th></tr>${r.map((a) => `<tr>
        <td><a class="cell-coin" href="${link(`/asset/?mint=${a.mint}`)}">${tile(a.logo, a.symbol)}<span><b>${esc(a.symbol)}</b>${a.launchable ? "" : ' <span class="badge">Not launchable</span>'}<br><span>${esc(a.name)}</span></span></a></td>
        <td class="r">${a.price?.usd ? money(Number(a.price.usd)) : ""}</td>
        <td class="r">${a.liquidityUsd ? `$${short(a.liquidityUsd)}` : ""}</td>
        <td class="r">${a.graduationTarget ? `${short(units(a.graduationTarget.raw, a.decimals))} ${esc(a.symbol)}` : ""}</td></tr>`).join("")}</tbody>`).join("");
    $('[data-live="assets"]').hidden = rows.length === 0;
  };
  kindChips($("[data-kinds]"), [...new Set(quotes.map((a) => a.category))], render);
  $("[data-search]").addEventListener("input", render);
  render();
};

pages.asset = async () => {
  const mint = params.get("mint");
  const quotes = (await read("/v1/quotes"))?.quotes ?? [];
  const a = quotes.find((q) => q.mint === mint);
  if (!a) return show($("[data-empty]"));
  document.title = `${a.symbol} · Stoker`;
  $("[data-asset-tile]").outerHTML = tile(a.logo, a.symbol, "tile tile-xl asset-tile");
  $("[data-asset-ticker]").textContent = a.symbol;
  $("[data-asset-name]").textContent = `${a.name} · ${KINDS[a.category]}`;
  const launch = $("[data-asset-launch]");
  if (a.launchable) { launch.textContent = `Stoke a coin paired with ${a.symbol}`; launch.href = link(`/launch?quote=${a.mint}`); } else launch.remove();
  if (a.category === "tokenized_stock") {
    const trade = $("[data-asset-trade]");
    trade.textContent = `Trade ${a.symbol}`;
    trade.href = link(`/stock/?mint=${a.mint}`);
    show(trade);
  }
  $("[data-asset-labels]").innerHTML = labelList(a);
  const facts = [
    ["Price", a.price?.usd ? money(Number(a.price.usd)) : ""],
    ["In SOL", a.price ? price(Number(a.price.sol)) : ""],
    ["Liquidity", a.liquidityUsd ? `$${short(a.liquidityUsd)}` : ""],
    ["A coin graduates at", a.graduationTarget ? `${short(units(a.graduationTarget.raw, a.decimals))} ${esc(a.symbol)}` : ""],
    ["Referral share", a.referralShare.allowed ? "Allowed" : "None"],
    ["Token program", a.tokenProgram.startsWith("Tokenz") ? "Token-2022" : "SPL Token"],
    ["Mint", `<a class="link" href="${solscan("token", a.mint)}">${shortAddress(a.mint)}</a>`],
  ].filter(([, v]) => v);
  $("[data-asset-facts]").innerHTML = facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  const coins = (await read(`/v1/launches?quote=${a.mint}&limit=8`))?.launches.filter((l) => l.quote.mint === a.mint) ?? [];
  if (coins.length) { coinTable($("[data-coins]"), coins, { compact: true }); show($('[data-live="paired"]')); }
  show($('[data-live="asset"]'));
};

/**
 * Stocks: every tokenized stock in the Quote Registry, open on Solana while the US market sleeps. The 24h change, the
 * stock's own last price and the trend line read what production's API doesn't serve yet (`change24h` and
 * `market.last` on a Quote Asset, `GET /v1/quotes/:mint/candles`); until it does, those columns stay empty and the
 * 24h sort stays hidden.
 */
pages.stocks = async () => {
  marketHours($("[data-hours]"));
  const all = (await read("/v1/quotes"))?.quotes.filter((q) => q.category === "tokenized_stock") ?? [];
  if (!all.length) return;
  const table = $("[data-stocks]");
  if (all.some((s) => s.change24h != null)) show($("[data-sort-change]"));
  const sorters = {
    liquidity: (a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1),
    change: (a, b) => (b.change24h ?? -Infinity) - (a.change24h ?? -Infinity),
    name: (a, b) => (a.symbol ?? "").localeCompare(b.symbol ?? ""),
  };
  const render = () => {
    const q = $("[data-search]").value.trim().toLowerCase();
    const issuer = checked("issuer") ?? "all";
    const rows = all
      .filter((s) => issuer === "all" || s.issuer === issuer)
      .filter((s) => !q || [s.symbol, s.name, s.market?.ticker, s.mint].some((v) => v?.toLowerCase().includes(q)))
      .sort(sorters[checked("sort")]);
    table.innerHTML = `
      <thead><tr><th scope="col">Stock</th><th scope="col" class="r">Price</th><th scope="col" class="r">24h</th><th scope="col" class="hide-sm"><span class="visually-hidden">Trend</span></th><th scope="col" class="r hide-sm">vs stock</th><th scope="col" class="r hide-sm">Liquidity</th><th scope="col" class="hide-sm">Issuer</th></tr></thead>
      <tbody>${rows.map((s) => {
        const [c, dir] = change(s.change24h, 2);
        const g = gap(s);
        return `<tr>
          <td><a class="cell-coin" href="${link(`/stock/?mint=${s.mint}`)}">${tile(s.logo, s.symbol, "tile asset-tile")}<span><b>${esc(s.symbol)}</b><br><span>${esc(s.name)}</span></span></a></td>
          <td class="r">${s.price?.usd ? money(Number(s.price.usd)) : ""}</td>
          <td class="r ${dir}">${c}</td>
          <td class="hide-sm"><svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" data-spark="${s.mint}" data-spark-path="/v1/quotes/${s.mint}/candles?interval=1h" aria-hidden="true"></svg></td>
          <td class="r hide-sm ${g.wide ? "gap-wide" : "muted"}">${g.text}</td>
          <td class="r hide-sm">${s.liquidityUsd ? `$${short(s.liquidityUsd)}` : ""}</td>
          <td class="hide-sm">${s.issuer ? `<span class="badge">${ISSUERS[s.issuer]}</span>` : ""}</td>
        </tr>`;
      }).join("")}</tbody>`;
    sparklines(table);
    $('[data-live="stocks"]').hidden = rows.length === 0;
    $("[data-empty]").hidden = rows.length > 0;
  };
  filterChips($("[data-issuers]"), "issuer", Object.keys(ISSUERS).filter((i) => all.some((s) => s.issuer === i)).map((i) => [i, ISSUERS[i]]), render);
  $("[data-search]").addEventListener("input", render);
  $("[data-sort]").addEventListener("change", render);
  render();
};

/** The Swap page's fee, which a stock trade through Jupiter pays: production's JUPITER_REFERRAL_FEE_BPS default. */
const SWAP_FEE_BPS = 50;
/** An amount of a stock or a currency: four decimals under one, for fractions of a share; two from there. */
const amount = (n) => n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 4 : 2 });

/**
 * One stock: its price beside the stock it tracks, the US market's hours, a trade through Jupiter in USDC or SOL, its
 * risk labels and the coins paired with it. The chart and the gap read the same proposed fields as the Stocks page.
 */
pages.stock = async () => {
  const mint = params.get("mint");
  const [quotes, launches] = mint ? await Promise.all([read("/v1/quotes"), read(`/v1/launches?quote=${mint}&limit=8`)]) : [];
  const s = quotes?.quotes.find((q) => q.mint === mint && q.category === "tokenized_stock");
  if (!s) return show($("[data-empty]"));
  document.title = `${s.symbol} · Stoker`;
  const usd = Number(s.price?.usd ?? 0);
  $("[data-stock-tile]").outerHTML = tile(s.logo, s.symbol, "tile tile-lg asset-tile");
  $("[data-stock-ticker]").textContent = s.symbol;
  $("[data-stock-name]").textContent = [s.name, ISSUERS[s.issuer]].filter(Boolean).join(" · ");
  $("[data-stock-price]").textContent = usd ? money(usd) : "";
  const [c, dir] = change(s.change24h, 2);
  Object.assign($("[data-stock-change]"), { textContent: c, className: dir });
  const g = gap(s);
  if (g.text) {
    const under = $("[data-stock-under]");
    under.textContent = `${s.market.ticker} ${usMarket().open ? "" : "closed at "}${money(s.market.last.price)} · ${g.text} vs stock`;
    if (g.wide) under.classList.add("gap-wide");
    show(under);
  }
  marketHours($("[data-hours]"));

  // Chart: the last day or five, from hourly candles.
  const closes = (await read(`/v1/quotes/${s.mint}/candles?interval=1h`))?.candles.map((k) => k.close) ?? [];
  if (closes.length >= 2) {
    const draw = () => lineChart($("[data-chart]"), closes.slice(-Number(checked("range"))));
    $("[data-range]").addEventListener("change", draw);
    draw();
    show($('[data-live="chart"]'));
  }

  $("[data-stock-labels]").innerHTML = labelList(s);
  const paired = launches?.launches.filter((l) => l.quote.mint === s.mint) ?? [];
  const stoke = $("[data-stock-stoke]");
  stoke.href = link(`/launch?quote=${s.mint}`);
  if (paired.length) {
    coinTable($("[data-coins]"), paired, { compact: true });
    show($('[data-live="paired"]'));
  } else stoke.textContent = "Stoke the first";

  // Trade: through Jupiter, paid in or paid out as USDC or SOL; the estimate is the price less the Swap page's fee.
  const usdOf = (symbol) => Number(quotes.quotes.find((q) => q.symbol === symbol)?.price?.usd ?? 0);
  $("[data-fee]").textContent = pct(SWAP_FEE_BPS);
  const estimate = () => {
    const value = Number($("[data-amount]").value.replace(/,/g, ""));
    const sell = checked("side") === "sell";
    const other = checked("with");
    const otherUsd = usdOf(other);
    const ok = value > 0 && usd > 0 && otherUsd > 0;
    $("[data-estimate]").hidden = !ok;
    if (!ok) return;
    const out = (sell ? value * usd / otherUsd : value * otherUsd / usd) * (1 - SWAP_FEE_BPS / 10_000);
    const unit = sell ? other : s.symbol;
    $("[data-get]").textContent = `${amount(out)} ${unit}`;
    $("[data-min]").textContent = `${amount(out * (1 - Number(checked("slip")) / 10_000))} ${unit}`;
  };
  const update = () => {
    const sell = checked("side") === "sell";
    $("[data-with-label]").textContent = sell ? "Receive" : "Pay with";
    $("[data-pay-token]").textContent = sell ? s.symbol : checked("with");
    const presets = sell ? ["25%", "50%", "All"] : checked("with") === "SOL" ? ["0.5", "1", "5"] : ["100", "500", "1000"];
    $("[data-presets]").innerHTML = presets.map((v) => `<button type="button" value="${v}">${Number(v) ? Number(v).toLocaleString("en-US") : v}</button>`).join("");
    estimate();
  };
  $("[data-trade]").addEventListener("change", update);
  $("[data-amount]").addEventListener("input", estimate);
  $("[data-presets]").addEventListener("click", (e) => {
    const v = e.target.closest("button")?.value;
    if (!v) return;
    // A share of the holding needs the wallet's balance, which comes with the wallet.
    $("[data-amount]").value = Number(v) ? v : "";
    estimate();
  });
  update();

  const facts = [
    ["Tracks", s.market ? `${esc(s.market.ticker)} on ${esc(s.market.venue)}` : ""],
    ["Issuer", ISSUERS[s.issuer] ?? ""],
    ["Liquidity", s.liquidityUsd ? `$${short(s.liquidityUsd)}` : ""],
    ["In SOL", s.price ? price(Number(s.price.sol)) : ""],
    ["Token program", s.tokenProgram.startsWith("Tokenz") ? "Token-2022" : "SPL Token"],
    ["Mint", `<a class="link" href="${solscan("token", s.mint)}">${shortAddress(s.mint)}</a>`],
  ].filter(([, v]) => v);
  $("[data-stock-facts]").innerHTML = facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  show($('[data-live="stock"]'));
};

pages.rewards = async () => {
  const rules = (await read("/v1/rewards/rules"))?.inForce;
  if (rules) {
    $("[data-rules]").innerHTML = [
      ["Version", rules.version],
      ["Minimum holding", `${short(units(rules.minHolding, 6))} coins`],
      ["A round runs once", `${short(units(rules.roundThreshold, 6))} coins of tax have collected`],
      ["In force since", day(rules.effectiveAt)],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    show($('[data-live="rules"]'));
  }
  $("[data-lookup]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const wallet = new FormData(e.target).get("wallet").trim();
    const r = await read(`/v1/wallets/${wallet}/rewards`);
    const rows = r?.rewards ?? [];
    $("[data-wallet-rewards]").innerHTML = rows.map((x) => `<tr><td><b>${esc(x.symbol)}</b></td><td class="muted">${day(x.roundStartedAt)}</td><td class="r">${short(units(x.amount, x.payout?.decimals ?? x.decimals))} ${esc(x.payout?.symbol ?? x.symbol)}</td></tr>`).join("");
    $('[data-live="wallet"]').hidden = !rows.length;
    $("[data-wallet-empty]").hidden = rows.length > 0;
  });
};

const KIND_LABELS = {
  platform_fee: "Platform Fee from curves", pool_fee: "Platform Fee from a pool", fee_key: "Fee Key LP fees", sweep: "Swept to treasury",
  creator_forward: "Forwarded to a Creator", burn: "Platform Token burn", flywheel: "Flywheel burn", arweave_top_up: "Arweave credits bought",
  metadata_upload: "Permanent metadata", reward_sale: "Reward Tax sold for holders", graduation_fee: "Graduation Fee, kept from a Creator's share",
};

pages.revenue = async () => {
  const [revenue, burns, ledger, quotes] = await Promise.all([read("/v1/revenue"), read("/v1/burns"), read("/v1/ledger?limit=20"), read("/v1/quotes")]);
  const inSol = new Map((quotes?.quotes ?? []).map((q) => [q.mint, Number(q.price?.sol ?? 0)]));
  const valued = (asset, raw) => units(raw, asset.decimals) * (asset.symbol === "SOL" ? 1 : inSol.get(asset.mint) ?? 0);
  if (revenue) {
    const total = revenue.totals.reduce((s, t) => s + valued(t.asset, BigInt(t.curves) + BigInt(t.pools) + BigInt(t.feeKeys)), 0);
    const creators = revenue.totals.reduce((s, t) => s + valued(t.asset, t.creatorForwarded), 0);
    figure("revenue", total && short(total), "SOL");
    figure("creators", creators && short(creators), "SOL");
    // Daily bars, in SOL.
    const days = revenue.days.map((d) => d.assets.reduce((s, a) => s + valued(a.asset, BigInt(a.curves) + BigInt(a.pools) + BigInt(a.feeKeys)), 0));
    const max = Math.max(...days, 0);
    if (max > 0) {
      const w = 300 / days.length;
      $("[data-bars]").innerHTML = days.map((v, i) => `<rect x="${i * w + w * 0.15}" y="${100 - (v / max) * 96}" width="${w * 0.7}" height="${(v / max) * 96}" rx="1"/>`).join("");
      show($('[data-live="days"]'));
    }
    $("[data-totals]").innerHTML = revenue.totals.map((t) => `<div class="panel pad">
      <div class="card-head">${tile(t.asset.logo, t.asset.symbol)}<span><b>${esc(t.asset.symbol)}</b><span>All time</span></span></div>
      <dl class="kv">
        <div><dt>Curves</dt><dd>${short(units(t.curves, t.asset.decimals))}</dd></div>
        <div><dt>Pools</dt><dd>${short(units(t.pools, t.asset.decimals))}</dd></div>
        <div><dt>Fee Keys</dt><dd>${short(units(t.feeKeys, t.asset.decimals))}</dd></div>
        <div><dt>Sent to Creators</dt><dd>${short(units(t.creatorForwarded, t.asset.decimals))}</dd></div>
      </dl></div>`).join("");
    show($('[data-live="totals"]'));
    $("[data-wallets]").innerHTML = [
      ["To Creators", "Half, within the hour"],
      ["Operations wallet", `<a class="link" href="${solscan("account", revenue.operationsWallet)}">${shortAddress(revenue.operationsWallet)}</a>`],
      ...(revenue.treasury ? [["Treasury", `<a class="link" href="${solscan("account", revenue.treasury)}">${shortAddress(revenue.treasury)}</a>`]] : []),
      ["Swept above", `${short(sol(revenue.sweepThresholdLamports))} SOL`],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    show($('[data-live="wallets"]'));
  }
  if (burns) {
    const stoker = burns.burned.find((b) => b.coin.mint === burns.platformToken);
    figure("burned", stoker && Number(stoker.amount) > 0 && short(units(stoker.amount, stoker.coin.decimals)));
    figure("share", pct(burns.shares.burnBps));
  }
  if (ledger?.entries.length) {
    $("[data-ledger]").innerHTML = `<thead><tr><th>Entry</th><th>Coin</th><th class="r">Amount</th><th class="r">Time</th></tr></thead><tbody>${ledger.entries.map((e) =>
      `<tr><td>${KIND_LABELS[e.kind] ?? e.kind}</td><td class="muted">${e.launch ? esc(e.launch.symbol) : ""}</td><td class="r">${short(units(e.amount, e.asset.decimals))} ${esc(e.asset.symbol)}</td><td class="r"><a class="link" href="${solscan("tx", e.signature)}">${ago(e.time)}</a></td></tr>`).join("")}</tbody>`;
    show($('[data-live="ledger"]'));
  }
};

pages.burns = async () => {
  const b = await read("/v1/burns");
  if (!b) return;
  const stoker = b.burned.find((x) => x.coin.mint === b.platformToken);
  figure("revenue", Number(b.budgets.revenueLamports) && short(sol(b.budgets.revenueLamports)), "SOL");
  figure("burn", Number(b.budgets.burn.spent) && short(sol(b.budgets.burn.spent)), "SOL");
  figure("flywheel", Number(b.budgets.flywheel.spent) && short(sol(b.budgets.flywheel.spent)), "SOL");
  figure("burned", stoker && Number(stoker.amount) && short(units(stoker.amount, stoker.coin.decimals)), stoker?.coin.symbol);
  $("[data-rule]").textContent = b.rule;
  show($('[data-live="rule"]'));
  if (b.nextFlywheel.length) {
    $("[data-next]").innerHTML = b.nextFlywheel.map((c) => `<a class="chip" href="${link(`/coin/?mint=${c.mint}`)}">${esc(c.symbol)}</a>`).join("");
    show($('[data-live="next"]'));
  }
  if (b.events.length) {
    $("[data-events]").innerHTML = `<thead><tr><th>Run</th><th class="r">Burned</th><th class="r">SOL spent</th><th class="r">Date</th></tr></thead><tbody>${b.events.map((e) =>
      `<tr><td>${e.kind === "burn" ? "The Burn" : "The Flywheel"} · ${esc(e.coin.symbol)}</td><td class="r">${short(units(e.amount, e.coin.decimals))}</td><td class="r">${short(sol(e.lamports))}</td><td class="r"><a class="link" href="${solscan("tx", e.signature)}">${day(e.time)}</a></td></tr>`).join("")}</tbody>`;
    show($('[data-live="events"]'));
  }
};

pages.announcements = async () => {
  const list = (await read("/v1/announcements"))?.announcements;
  if (!list) return;
  if (!list.length) return show($("[data-empty]"));
  $("[data-announcements]").innerHTML = list.map((a) => `<li class="panel pad">
    <p class="note">${day(a.effectiveAt)}</p>
    <h3>Platform Fee ${pct(a.platformFeeBps)}, Creator Fee ${pct(a.creatorFeeBps)}</h3>
    ${a.note ? `<p>${esc(a.note)}</p>` : ""}
    <p>${a.appliedSignature ? `<a class="link" href="${solscan("tx", a.appliedSignature)}">Applied</a>` : `<span class="badge badge-gold">Due</span>`}</p>
  </li>`).join("");
  show($("[data-announcements]"));
};

pages.api = async () => {
  const p = await read("/v1/platform");
  if (!p) return;
  $("[data-answer]").textContent = JSON.stringify(p, null, 2);
  show($('[data-live="answer"]'));
};

pages.fees = async () => {
  const [p, burns] = await Promise.all([read("/v1/platform"), read("/v1/burns")]);
  const set = (key, text) => { const el = $(`[data-fee="${key}"]`); if (el && text) el.textContent = text; };
  if (p) {
    const grad = sol(p.graduationFeeLamports);
    if (grad > 0) set("graduation", `${grad.toLocaleString("en-US")} SOL's worth, once`);
    else $('[data-fee-row="graduation"]')?.remove();
    set("platform", `${pct(p.platformFeeBps)} of every trade`);
    set("creator", p.creatorFeeBps === 0 ? "None" : `${pct(p.creatorFeeBps)} of every trade`);
    set("raydiumCurve", `${pct(p.raydiumFee.curveBps)} of every trade`);
    set("referral", `${pct(p.referralShareBps)} of a referred trade`);
    set("poolCreator", `${pct(p.poolCreatorFeeBps)} of every trade`);
    set("pool", `${pct(p.raydiumFee.poolBps)} of every trade`);
  }
  if (burns?.shares) {
    set("burn", `${pct(burns.shares.burnBps)} buys and burns STOKER`);
    set("flywheel", `${pct(burns.shares.flywheelBps)} buys and burns the top ${burns.shares.flywheelTopN}`);
  } else {
    $$('[data-fee-row="burn"], [data-fee-row="flywheel"]').forEach((el) => el.remove());
  }
};

/** The strip under the header on every page but home: the platform's figures now, each shown only when real. */
async function pulse() {
  const [stats, revenue, quotes] = await Promise.all([read("/v1/stats"), read("/v1/revenue"), read("/v1/quotes")]);
  const inSol = new Map((quotes?.quotes ?? []).map((q) => [q.mint, Number(q.price?.sol ?? 0)]));
  const paid = (revenue?.totals ?? []).reduce((s, t) => s + units(t.creatorForwarded, t.asset.decimals) * (t.asset.symbol === "SOL" ? 1 : inSol.get(t.asset.mint) ?? 0), 0);
  const items = [
    ["24h volume", stats?.volume24h?.sol && `${short(stats.volume24h.sol)} SOL`],
    ["Coins", stats?.launches && whole(stats.launches)],
    ["Graduated", stats?.graduated && whole(stats.graduated)],
    ["Paid to Creators", paid > 0 && `${short(paid)} SOL`],
  ].filter(([, v]) => v);
  if (!items.length) return;
  $("[data-pulse]").innerHTML = items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  show($('[data-live="pulse"]'));
}

const page = document.body.dataset.page;
if (page !== "index") pulse();
await pages[page]?.();
