# Fonts

SurvScope bundles seven font families. Each has regular, bold, italic and bold italic. The same TrueType files are used on screen, while editing, and in SVG and PDF exports. PNG shows the same lettering as pixels. Fonts load from the site itself. Liberation Sans is the default.

The familiar-name menu choices are alternatives, not copies of the proprietary fonts. The menu shows the real font name under each preview. The menu choices are listed in the [user guide](user-guide.md#choose-a-font).

| Family | Source | License |
| --- | --- | --- |
| Liberation Sans, Serif, Mono | [Liberation Fonts](https://github.com/liberationfonts/liberation-fonts) | [OFL notice](../web/public/fonts/LICENSE.txt) |
| Carlito | [Google Fonts](https://github.com/google/fonts/tree/e44c4b011a820c2cbe2fd2cfa8052037d7edb571/ofl/carlito) | [OFL notice](../web/public/fonts/Carlito-LICENSE.txt) |
| Lato | [Google Fonts](https://github.com/google/fonts/tree/e44c4b011a820c2cbe2fd2cfa8052037d7edb571/ofl/lato) | [OFL notice](../web/public/fonts/Lato-LICENSE.txt) |
| Source Sans 3 | [Adobe](https://github.com/adobe-fonts/source-sans/tree/87b37a2daaed80fcb8e8ccb0085c4d72ddade12e/TTF) | [OFL notice](../web/public/fonts/SourceSans3-LICENSE.txt) |
| Source Serif 4 | [Adobe](https://github.com/adobe-fonts/source-serif/tree/80d3f8894c09c937bebfa9011247d2e1c79fd6f4/TTF) | [OFL notice](../web/public/fonts/SourceSerif4-LICENSE.txt) |

The files are unchanged from upstream. [sources.json](../web/public/fonts/sources.json) lists their URLs, revisions and SHA-256 hashes. No unused weights or variable-font sources are bundled.

Tests check the hashes, license notices, that the menu matches the CSS faces, and that presets keep font choices. Browser tests check loading, editing, same-origin requests and embedded fonts in exports.

## For maintainers

The families and their four file names are in [`fontCatalog.ts`](../web/src/fontCatalog.ts). Keep it, [`fonts.css`](../web/src/fonts.css) and the bundled files in sync. Keep the `Sans`, `Serif` and `Mono` IDs so older projects look the same.
