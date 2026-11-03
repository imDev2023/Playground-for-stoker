import { read, $, $$, show, esc, link, whole, short, price, pct, change, ago, shortAddress, ticker, day, tile, coinTable, figure } from "./lib.js";

// Pages ----------------------------------------------------------------------
const pages = {};

pages.index = async () => {
  const [quotes, stats, launches] = await Promise.all([read("/v1/quotes"), read("/v1/stats"), read("/v1/launches?sort=trending&limit=5")]);
  const assets = quotes?.quotes.filter((q) => q.launchable).length;
  figure("assets", assets && whole(assets));
  figure("launches", stats?.launches && whole(stats.launches));
  figure("graduated", stats?.graduated && whole(stats.graduated));
  figure("volume", stats?.volume24h?.sol && short(stats.volume24h.sol), "SOL");
  if (launches?.launches.length) {
    coinTable($("[data-coins]"), launches.launches.slice(0, 5));
    show($('[data-live="trending"]'));
  }
};

pages.fees = async () => {
  const p = await read("/v1/platform");
  const burns = await read("/v1/burns");
  const set = (key, text) => { const el = $(`[data-fee="${key}"]`); if (el && text) el.textContent = text; };
  if (p) {
    const grad = Number(p.graduationFeeLamports) / 1e9;
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
