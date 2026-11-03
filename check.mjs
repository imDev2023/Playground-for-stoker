// Serves the page, opens it at phone and desktop widths in both schemes against the fixture, and fails on a console
// error, a horizontal scroll or a live part left hidden. Screenshots land in ./shots. Needs Playwright: `node check.mjs`.
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { createRequire } from "node:module";

// Required rather than imported, so a Playwright installed globally is found too.
const { chromium } = createRequire(import.meta.url)("playwright");

const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml" };
const root = new URL(".", import.meta.url).pathname;
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  try {
    const body = await readFile(join(root, path === "/" ? "index.html" : path));
    res.writeHead(200, { "content-type": types[extname(path) || ".html"] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const url = `http://localhost:${server.address().port}/?api=fixture`;

await mkdir(join(root, "shots"), { recursive: true });
const browser = await chromium.launch();
const failures = [];
for (const [name, width] of [["phone", 390], ["desktop", 1280]]) {
  for (const scheme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: scheme });
    // Fonts come from Google; offline runs fall back to system faces, which is not a failure of the page.
    page.on("console", (m) => m.type() === "error" && !m.text().includes("fonts.") && failures.push(`${name}/${scheme}: ${m.text()}`));
    page.on("pageerror", (e) => failures.push(`${name}/${scheme}: ${e.message}`));
    await page.goto(url, { waitUntil: "networkidle" }).catch(() => page.goto(url));
    await page.waitForSelector("[data-trending]:not([hidden])", { timeout: 5000 }).catch(() => failures.push(`${name}/${scheme}: trending stayed hidden`));
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) failures.push(`${name}/${scheme}: scrolls sideways`);
    await page.screenshot({ path: join(root, "shots", `${name}-${scheme}.png`), fullPage: true });
    await page.close();
  }
}
await browser.close();
server.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok: phone and desktop, light and dark");
