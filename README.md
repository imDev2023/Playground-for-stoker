# Stoker, redesigned

An experimental redesign of every public page of [stoker.markets](https://stoker.markets). It lives in this playground only; nothing here touches the production site or its repository.

```sh
node build.mjs                # writes the site to dist/, one folder per route
node check.mjs                # builds, then opens every page on phone and desktop, light and dark
node check.mjs --shots        # the same, saving a screenshot of each to shots/
cd dist && python3 -m http.server   # then open http://localhost:8000/?api=fixture
```

No dependencies. `check.mjs` needs Playwright, which it finds installed globally or locally.

## How it is built

| Path | Does |
| --- | --- |
| `src/layout.html` | The header, footer and `<head>` every page shares. |
| `src/pages/*.html` | One file per route. Front matter (`route`, `title`, `description`), then the page's content. |
| `src/style.css` | Tokens, base, primitives (buttons, panels, tables, forms, figures), then each page's own pieces. |
| `src/lib.js` | Where data comes from, how it is formatted, and the coins table several pages share. |
| `src/app.js` | One renderer per page, picked by `<body data-page>`. |
| `src/fixture.json` | Sample answers for every endpoint the pages read, in the API's shapes. Every coin and figure in it is made up. |
| `build.mjs` | Wraps each page in the layout and writes `dist/<route>/index.html`. `BASE=/sub/path` prefixes links for hosting under a sub-path. |

Every page is complete HTML before any script runs. The scripts fill only the parts that come from the API, and a part with nothing real behind it stays hidden: never a zero, a placeholder or an error.

## Data

The pages read Stoker's public API (`https://api.stoker.markets/v1`). That API only answers browsers on Stoker's own domain, so anywhere else the live parts stay hidden. To review them:

- `?api=fixture` reads `src/fixture.json`. The choice is remembered for the visit, so links keep it.
- `?api=<origin>` reads another deployment of the API.
- `?api=live` goes back to the real one.

## Pages

Home, Explore (`/coins`), a coin (`/coin/?mint=`), Stoke a coin (`/launch`), Swap, Assets, an asset (`/asset/?mint=`), Holder rewards, Curated, Stats (`/revenue`), Burn and Flywheel (`/burns`), Fee changes (`/announcements`), Developers (`/api`), Fees, Terms, Privacy, Risk disclosure and 404.

A coin and an asset take their mint as `?mint=` because a static site can't serve `/coin/<mint>`. Production's own routes stay as they are.

Not redesigned: the creator dashboard, the operator console, a wallet's rewards and a single reward round. They are reached from a connected wallet or an admin key.

The wallet buttons and the Swap card are designed but not wired: connecting a wallet, signing, and Jupiter's swap belong to the production app.

## Design

- **Purpose first.** Each page leads with its one title and then the thing itself. Ledes, eyebrows, captions and helper text are cut; where a page needed them, the layout changed instead (Holder rewards and Curated became three numbered steps, the Fees table became one entry per fee).
- **Trust.** One serif for statements, one sans for anything read or acted on, tabular figures throughout. Ivory and ink, hairlines instead of boxes, one accent, the brand's heat, kept for the mark and what a Creator earns. Every figure links to the record it comes from, and every page ends with the risk sentence.
- **The same words.** The legal pages, fee rules and risk labels keep production's wording; only the framing around them changed.
- **A trader's tools inside the calm.** The pair on every coin (the asset's badge, the asset in the accent), before-you-buy marks, subscript prices, slippage, the asset's risk card, a live strip of the platform's figures, 24-hour trend lines, a watchlist and `/` to search.
- **One departure from production.** The launch summary shows where $1,000 of curve trading goes (to you, holders, the platform, Raydium), read from `GET /v1/platform`. Production keeps every fee figure on the Fees page alone.
- **Browser storage.** The watchlist lives in the viewer's own browser and nowhere else.
