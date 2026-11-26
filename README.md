# Transalpin VAN-Transport-Protocol

Static web page where club members register their containers for the Transalpin
van (Zürich → Hamburg and back). For each container it prints two A4 labels in
"ethernet frame" style (one for the way there, one for the way back) and a
payload list with the precise content, as needed for the Carnet ATA.

No build step, no server: everything runs in the browser. The only third-party
code is the bundled QR code generator in `vendor/`.
Containers are saved in the member's browser (local storage). The only data
that leaves the browser is the e-mail the member sends to themself with
`info@luxeria.ch` in CC.

## Files

- `index.html` - form and explanations
- `config.js` - **edit this**: assembly suggestions, handling flags, event name, collector address
- `app.js` - container list, label and payload list rendering, validation, mail draft
- `style.css` - screen and print layout (A4 landscape)
- `vendor/qrcode.js` - [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 by Kazuhiko Arase, MIT license

## Publish on GitHub Pages

1. Push this folder to a GitHub repository.
2. Repository → Settings → Pages → "Deploy from a branch", branch `main`, folder `/ (root)`.

## Collecting the sheets

Every mail ends with a line starting with `VTP2 ` followed by the container as
JSON, so the collected mails can be turned into one list for load planning and
the Carnet ATA.

- `items` is a list of `[quantity, description, CHF per piece]`; `value` is the
  total in CHF.
- `fcs` is a CRC32 over the rest of the data. It is printed on the labels and
  the payload list and identifies the sheet.
- The QR code on each label holds the same line without `items` (long lists
  made the code unscannable) and with `"itemCount": <count>` instead. Match it
  to the mailed sheet by `fcs` to get the item list. Non-ASCII characters are
  written as JSON `\uXXXX` escapes; any JSON parser turns them back into umlauts.
- Sheets mailed with the first version of the page start with `VTP1 ` and have
  a single `payload` text and `value` instead of `items`.
