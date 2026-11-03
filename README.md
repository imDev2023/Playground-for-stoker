# Stoker landing, redesigned

The landing for [stoker.markets](https://stoker.markets), cut to what it has to say: one slogan, the pair it means, three ideas, the coins people trade, one promise, one button.

Four files, no build, no dependencies. Open `index.html` or serve the folder.

```sh
python3 -m http.server        # then open http://localhost:8000/?api=fixture
node check.mjs                # phone and desktop, light and dark; screenshots in ./shots
```

| File | Does |
| --- | --- |
| `index.html` | The whole page. Readable, indexable and usable without JavaScript. |
| `style.css` | Tokens at the top, then one block per section, in page order. |
| `live.js` | Fills the figures and the trending coins from the public API. A read that fails leaves its part hidden. |
| `fixture.json` | What the API answers, for reviewing the layout offline (`?api=fixture`). |

The API (`https://api.stoker.markets`) only answers browsers on Stoker's own origin, so elsewhere the live parts stay hidden. Use `?api=fixture`, or `?api=<origin>` for another deployment.

## What changed from the live landing

- **Hero.** The lede, search field and live rows are gone. A pair, `STOKER / SOL`, rolls through SOL, USDC, NVDAx, SPYx and TSLAx, and says what the lede said.
- **Figures.** Four, labelled in a word. The "Live from the chain since…" caption is gone. Figures with nothing behind them stay hidden, as before.
- **Ideas.** Each is a statement and a picture. The body copy, captions and fact cards became a chip grid, a split and a checklist.
- **Promise.** The eyebrow, the heading, the lede, the three cards and the closing caption became one sentence.
- **Invitation and footer.** One heading and one button. The footer is a single row of links.

Every link and route is the same as on the live site, and so are the fonts, colours and mark.

## Moving it into `apps/web`

Each `<section>` maps to a component the live page already has (`Hero`, `Stats`, `Ideas`, `Trending`, `Promise`, `Invite`), and `live.js` reads the same endpoints as `src/lib/api.ts`. The port is markup and CSS modules. No contract or API changes.
