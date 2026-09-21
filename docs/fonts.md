# Fonts in your figures

SurvScope supplies seven families in regular, bold, italic, and bold italic. The same TrueType files are used for the browser figure, direct text editing, and embedded SVG/PDF exports; PNG renders the same lettering as pixels. All requests are to the website's own origin; no external font service is contacted. The original Liberation Sans default and 6.8-inch figure are unchanged.

The Arial / Helvetica-style choice uses Liberation Sans. It is an alternative, not a copy of those proprietary font files. The font menu always identifies the actual face below its preview. Liberation Serif and Mono provide Times New Roman- and Courier New-style choices; Carlito provides a Calibri-style choice. Lato and Adobe's Source families offer additional designs.

| Family | Original source | Bundled license |
| --- | --- | --- |
| Liberation Sans, Serif, Mono | [Liberation Fonts](https://github.com/liberationfonts/liberation-fonts) | [OFL notice](../web/public/fonts/LICENSE.txt) |
| Carlito | [Google Fonts](https://github.com/google/fonts/tree/e44c4b011a820c2cbe2fd2cfa8052037d7edb571/ofl/carlito) | [OFL notice](../web/public/fonts/Carlito-LICENSE.txt) |
| Lato | [Google Fonts](https://github.com/google/fonts/tree/e44c4b011a820c2cbe2fd2cfa8052037d7edb571/ofl/lato) | [OFL notice](../web/public/fonts/Lato-LICENSE.txt) |
| Source Sans 3 | [Adobe](https://github.com/adobe-fonts/source-sans/tree/87b37a2daaed80fcb8e8ccb0085c4d72ddade12e/TTF) | [OFL notice](../web/public/fonts/SourceSans3-LICENSE.txt) |
| Source Serif 4 | [Adobe](https://github.com/adobe-fonts/source-serif/tree/80d3f8894c09c937bebfa9011247d2e1c79fd6f4/TTF) | [OFL notice](../web/public/fonts/SourceSerif4-LICENSE.txt) |

The sixteen added files are unchanged upstream TrueType assets. Their exact URLs, revisions, and SHA-256 hashes are recorded in [sources.json](../web/public/fonts/sources.json). Tests verify those hashes, the license notices, the correspondence between the menu and CSS faces, and preservation of font choices in saved presets. Browser tests check loading, direct editing, same-origin requests, and embedded vector exports. No unused weights or variable-font build sources are bundled.

For maintainers: the selectable families and their four file names live in [`fontCatalog.ts`](../web/src/fontCatalog.ts). Keep its entries, [`fonts.css`](../web/src/fonts.css), and bundled files synchronized. Preserve the `Sans`, `Serif`, and `Mono` identifiers so older projects keep their appearance.
