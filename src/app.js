// One renderer per page, picked by <body data-page>. Each fills what the API answers and leaves the rest hidden.
import { read, $, $$, show, esc, link, whole, short, price, pct, change, ago, shortAddress, ticker, day, tile, coinTable, figure } from "./lib.js";

const params = new URLSearchParams(location.search);
const sol = (lamports) => Number(lamports) / 1e9;
const units = (raw, decimals) => Number(raw) / 10 ** decimals;
const solscan = (kind, id) => `https://solscan.io/${kind}/${id}`;
const checked = (name) => $(`input[name="${name}"]:checked`)?.value;

/** The category chips that filter a list, from the categories present, with All first. */
const KINDS = { sol: "Solana", stablecoin: "Currencies", tokenized_stock: "Stocks", wrapped: "Wrapped", defi: "DeFi", rwa: "Real-world assets", leveraged: "Leverage", collectible: "Collectibles", meme: "Memes", community: "Community" };
function kindChips(el, categories, onChange) {
  const present = Object.keys(KINDS).filter((k) => categories.includes(k));
  if (present.length < 2) return;
  el.innerHTML = ["all", ...present].map((k, i) =>
    `<label class="chip chip-pick"><input type="radio" name="kind" value="${k}"${i ? "" : " checked"}>${k === "all" ? "All" : KINDS[k]}</label>`).join("");
  el.addEventListener("change", onChange);
  show(el);
}

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
    const rows = all
      .filter((l) => !q || [l.name, l.symbol, l.mint].some((s) => s.toLowerCase().includes(q)))
      .filter((l) => kind === "all" || l.quote.category === kind)
      .sort(sorters[checked("sort")]);
    coinTable(table, rows);
    $('[data-live="board"]').hidden = rows.length === 0;
    $("[data-empty]").hidden = rows.length > 0 || all.length === 0;
  };
  if (!all.length) return;
  kindChips($("[data-kinds]"), [...new Set(all.map((l) => l.quote.category))], render);
  $("[data-search]").addEventListener("input", render);
  $("[data-sort]").addEventListener("change", render);
  render();
};

pages.coin = async () => {
  const mint = params.get("mint");
  const [l, platform] = await Promise.all([mint ? read(`/v1/launches/${mint}`) : null, read("/v1/platform")]);
  if (!l) return show($("[data-empty]"));
  const q = ticker(l.quote);
  document.title = `${l.symbol} / ${q} · Stoker`;
  $("[data-coin-tile]").outerHTML = tile(l.image, l.symbol, "tile tile-lg");
  $("[data-coin-pair]").textContent = `${l.symbol}/${q}`;
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
    const closes = data?.candles.map((k) => k.close) ?? [];
    const svg = $("[data-chart]");
    if (closes.length < 2) { svg.innerHTML = ""; return; }
    const lo = Math.min(...closes), hi = Math.max(...closes), span = hi - lo || 1;
    const pts = closes.map((v, i) => `${(i / (closes.length - 1)) * 100},${92 - ((v - lo) / span) * 84}`);
    svg.innerHTML = `<defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".12"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
      <polygon class="chart-fill" points="0,100 ${pts.join(" ")} 100,100"/><polyline class="chart-line" points="${pts.join(" ")}"/>`;
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
    $("[data-get]").textContent = side() === "buy" ? `${short(net / p)} ${l.symbol}` : `${price(net * p)} ${q}`;
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
    ["Paired with", `<a class="link" href="${link(`/asset/?mint=${l.quote.mint}`)}">${esc(q)}</a>`],
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
  const quotes = (await read("/v1/quotes"))?.quotes.filter((q) => q.launchable) ?? [];
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
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
    $("[data-preview-pair]").textContent = `${sym}/${quote}`;
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
        <td class="r">${a.price?.usd ? `$${price(Number(a.price.usd))}` : ""}</td>
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
  $("[data-asset-tile]").outerHTML = tile(a.logo, a.symbol, "tile tile-lg");
  $("[data-asset-ticker]").textContent = a.symbol;
  $("[data-asset-name]").textContent = `${a.name} · ${KINDS[a.category]}`;
  const launch = $("[data-asset-launch]");
  if (a.launchable) { launch.textContent = `Stoke a coin paired with ${a.symbol}`; launch.href = link(`/launch?quote=${a.mint}`); } else launch.remove();
  const labels = a.labels ?? [];
  $("[data-asset-labels]").innerHTML = labels.length
    ? labels.map((x) => `<li><span class="badge ${x.severity === "caution" ? "badge-warn" : ""}">${esc(x.title)}</span><p>${esc(x.detail)}</p><p class="note">${esc(x.source)}</p></li>`).join("")
    : `<li><p>Nothing to flag: no issuer authority over wallets, no transfer fee, and on the verified list.</p></li>`;
  const facts = [
    ["Price", a.price?.usd ? `$${price(Number(a.price.usd))}` : ""],
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

await pages[document.body.dataset.page]?.();
