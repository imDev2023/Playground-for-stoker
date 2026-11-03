# For agents

- The page is `index.html`. Edit the HTML first, then the CSS. `live.js` only fills `[data-figure]`, `[data-asset-count]` and `[data-trending]`.
- No taglines, helper text or secondary labels. If a section needs one to make sense, change its layout.
- Every live part starts `hidden` and is shown only once a real, non-zero value arrives. Never render a zero, a placeholder or an error.
- Colours come from the tokens at the top of `style.css`. Each one is set for light and dark.
- Links point at `https://stoker.markets/...` routes that exist today. Don't invent routes.
- Run `node check.mjs` before committing. It must print `ok`.
