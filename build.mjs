// Builds the site: every file in src/pages is wrapped in src/layout.html and written to dist/<route>/index.html, so the
// URLs match stoker.markets (/coins, /fees, ...). Static files in src/ are copied as they are. No dependencies.
//
// A page starts with its front matter:
//   ---
//   route: /fees
//   title: Fees
//   description: One sentence for search results and share cards.
//   ---
// `BASE=/repo node build.mjs` prefixes every root-relative link, for hosting under a sub-path (GitHub Pages).
import { readdir, readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";
import { join } from "node:path";

const root = new URL(".", import.meta.url).pathname;
const src = join(root, "src");
const out = join(root, "dist");
const base = (process.env.BASE ?? "").replace(/\/$/, "");

export async function build() {
  await rm(out, { recursive: true, force: true });
  await cp(src, out, { recursive: true, filter: (p) => !p.includes("/pages") && !p.endsWith("layout.html") });
  const layout = await readFile(join(src, "layout.html"), "utf8");
  const routes = [];
  for (const file of (await readdir(join(src, "pages"))).sort()) {
    const text = await readFile(join(src, "pages", file), "utf8");
    const [, head, body] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? [];
    if (!head) throw new Error(`${file}: missing front matter`);
    const meta = Object.fromEntries(head.split("\n").map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]));
    const route = meta.route;
    const section = "/" + route.split("/")[1];
    let html = layout
      .replaceAll("{{title}}", meta.title ? `${meta.title} · Stoker` : "Stoker · Launch a coin on Solana priced in the asset you pick")
      .replaceAll("{{description}}", meta.description ?? "")
      .replaceAll("{{route}}", route)
      .replaceAll("{{page}}", file.replace(".html", ""))
      .replace("{{content}}", body);
    // The header marks the section the page belongs to.
    html = html.replace(new RegExp(`(<nav class="nav"[\\s\\S]*?)href="${section}"`), `$1href="${section}" aria-current="page"`);
    if (base) html = html.replace(/(href|src|action)="\/(?!\/)/g, `$1="${base}/`).replace(/data-base=""/, `data-base="${base}"`);
    const dir = route === "/404" ? out : join(out, route);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, route === "/404" ? "404.html" : "index.html"), html);
    routes.push(route);
  }
  return routes;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const routes = await build();
  console.log(`built ${routes.length} pages into dist/`);
}
