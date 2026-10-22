# Ega Scotoni (feature module)

**Status: placeholder — TODO: confirm what Ega Scotoni is.**

Nothing in the project, in public listings (tourism board, guides) or in a web search
defines "Ega Scotoni", so this module ships neutral placeholder copy in the hut's tone,
clearly marked as a draft on the page.

## Files

| File | Purpose |
|---|---|
| `data.js` | All texts in IT / DE / EN. **Change the content here.** |
| `ega-scotoni.js` | Renders the homepage teaser and the page (used by the build). |
| `ega-scotoni.css` | Styles for this feature only. |

## Switch on / off

`src/data/hut.config.js` → `features.egaScotoni`. When `false`, the build removes the nav
link, the homepage teaser and the `ega-scotoni.html` pages. Then run `npm run build`.

## Rename or repurpose

- Different name: change `title` (and `slug` for the URL) in `data.js`.
- Different kind of thing (menu line, event, product, place on the terrace…): replace the
  `blocks` in `data.js`; if it needs a list of items or dates, add them to `data.js` and
  render them in `ega-scotoni.js`.
- Remove entirely: set the flag to `false`, delete this folder, and remove the three
  imports of `ega-scotoni` in `scripts/build.mjs`.

## Spelling

"Ega" may be a Ladin word (Val Badia). The site keeps the spelling exactly as given and
does not translate it.
