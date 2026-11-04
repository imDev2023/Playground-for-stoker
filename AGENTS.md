# For agents

- This is an experimental redesign. Never change the production repository (`imDev2023/Stoker-Markets`) from here.
- A page is `src/pages/<name>.html`: front matter, then HTML. Shared chrome is `src/layout.html`. Never edit `dist/`; it is built.
- Edit the HTML first, then the CSS, then the script. `src/app.js` holds one renderer per page (`pages.<name>`) and only fills elements marked `data-*`.
- No taglines, helper text or secondary labels. If a section needs one to make sense, change its layout.
- Every live part starts `hidden` and is shown only once a real, non-zero value arrives. Never render a zero, a placeholder or an error.
- Colours come from the tokens at the top of `src/style.css`; each is set for light and dark. Reuse the primitives (`.panel`, `.table`, `.kv`, `.figures`, `.seg`, `.field`, `.chip`, `.badge`) before adding a class.
- Links use production's routes (`/coins`, `/fees`, ...). The only stand-ins are `/coin/?mint=`, `/asset/?mint=` and `/stock/?mint=`; `/stocks` and `/stock` are new pages production doesn't have.
- The Stocks pages read three proposed API fields listed in the README. Anything built on them stays hidden when they're absent.
- The US market's holiday calendar in `src/lib.js` covers 2026 and 2027; extend it from the exchanges' published calendars.
- Legal, fee and risk wording comes from production. Don't paraphrase it into a promise.
- When an endpoint's shape changes, update `src/fixture.json` to match.
- Run `node check.mjs` before committing. It must print `ok`.
