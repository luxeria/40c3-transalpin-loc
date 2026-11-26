# Transalpin VAN-Transport-Protocol

Static web page where club members register an item for the Transalpin van
(Zürich → Hamburg and back) and print two A4 labels in "ethernet frame" style:
one for the way there, one for the way back.

No build step, no dependencies, no server: everything runs in the browser.
The only data that leaves the browser is the e-mail the member sends to
themself with `info@luxeria.ch` in CC.

## Files

- `index.html` - form and explanations
- `config.js` - **edit this**: assembly suggestions, handling flags, event name, collector address
- `app.js` - label rendering, validation, mail draft
- `style.css` - screen and print layout (A4 landscape)

## Publish on GitHub Pages

1. Push this folder to a GitHub repository.
2. Repository → Settings → Pages → "Deploy from a branch", branch `main`, folder `/ (root)`.

## Collecting the sheets

Every mail ends with a line starting with `VTP1 ` followed by the item as JSON,
so the collected mails can be turned into one list for load planning and the
Carnet ATA. The `FCS` on the label is a CRC32 over the same data and identifies
the sheet.
