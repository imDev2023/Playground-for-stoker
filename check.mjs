// Builds the site, serves dist/, and opens every page at phone and desktop widths in light and dark, against the
// fixture. Fails on a console error, a sideways scroll, or a data page whose live parts all stayed hidden.
// Screenshots land in ./shots. Needs Playwright: `node check.mjs` (add `--shots` to save every screenshot).
import { createServer } from "node:http";
import { readFile, mkdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { createRequire } from "node:module";
import { build } from "./build.mjs";

// Required rather than imported, so a Playwright installed globally is found too.
const { chromium } = createRequire(import.meta.url)("playwright");

const root = new URL(".", import.meta.url).pathname;
const dist = join(root, "dist");
const routes = await build();
const fixture = JSON.parse(await readFile(join(dist, "fixture.json"), "utf8"));
const coin = fixture["/v1/launches"].launches[0].mint;
const asset = fixture["/v1/quotes"].quotes.find((q) => q.symbol === "NVDAx").mint;
const query = { "/coin": `mint=${coin}`, "/asset": `mint=${asset}`, "/stock": `mint=${asset}` };
const live = new Set(["/", "/coins", "/coin", "/stocks", "/stock", "/assets", "/asset", "/revenue", "/burns", "/announcements", "/api"]);

const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  let path = join(dist, decodeURIComponent(new URL(req.url, "http://x").pathname));
  try {
    if ((await stat(path)).isDirectory()) path = join(path, "index.html");
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(await readFile(path));
  } catch {
    res.writeHead(404, { "content-type": "text/html" }).end(await readFile(join(dist, "404.html")));
  }
}).listen(0);
const origin = `http://localhost:${server.address().port}`;

const shots = process.argv.includes("--shots");
if (shots) await mkdir(join(root, "shots"), { recursive: true });
const browser = await chromium.launch();
const failures = [];
for (const route of routes.filter((r) => r !== "/404")) {
  for (const [size, width] of [["phone", 390], ["desktop", 1280]]) {
    for (const scheme of ["light", "dark"]) {
      const at = `${route}/${size}/${scheme}`;
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: scheme });
      // Fonts come from Google; an offline run falls back to system faces, which is not a failure of the page.
      page.on("console", (m) => m.type() === "error" && !/fonts\.|Failed to load resource/.test(m.text()) && failures.push(`${at}: ${m.text()}`));
      page.on("pageerror", (e) => failures.push(`${at}: ${e.message}`));
      await page.goto(`${origin}${route === "/" ? "/" : `${route}/`}?api=fixture${query[route] ? `&${query[route]}` : ""}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      if (live.has(route) && !(await page.$("[data-live]:not([hidden])"))) failures.push(`${at}: every live part stayed hidden`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) failures.push(`${at}: scrolls sideways`);
      if (shots) await page.screenshot({ path: join(root, "shots", `${route === "/" ? "home" : route.slice(1)}-${size}-${scheme}.png`), fullPage: true });
      await page.close();
    }
  }
}
await browser.close();
server.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`ok: ${routes.length - 1} pages, phone and desktop, light and dark`);
