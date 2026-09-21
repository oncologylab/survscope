export const FONT_CATALOG = {
  Sans: {
    label: "Arial / Helvetica style",
    name: "Liberation Sans",
    note: "A bundled alternative to Arial and Helvetica. Original figure style.",
    files: [
      "LiberationSans-Regular.ttf",
      "LiberationSans-Bold.ttf",
      "LiberationSans-Italic.ttf",
      "LiberationSans-BoldItalic.ttf",
    ],
  },
  Serif: {
    label: "Times New Roman style",
    name: "Liberation Serif",
    note: "A bundled alternative to Times New Roman.",
    files: [
      "LiberationSerif-Regular.ttf",
      "LiberationSerif-Bold.ttf",
      "LiberationSerif-Italic.ttf",
      "LiberationSerif-BoldItalic.ttf",
    ],
  },
  Mono: {
    label: "Courier New style",
    name: "Liberation Mono",
    note: "A bundled alternative to Courier New.",
    files: [
      "LiberationMono-Regular.ttf",
      "LiberationMono-Bold.ttf",
      "LiberationMono-Italic.ttf",
      "LiberationMono-BoldItalic.ttf",
    ],
  },
  Carlito: {
    label: "Calibri style — Carlito",
    name: "Carlito",
    note: "A bundled alternative to Calibri.",
    files: [
      "Carlito-Regular.ttf",
      "Carlito-Bold.ttf",
      "Carlito-Italic.ttf",
      "Carlito-BoldItalic.ttf",
    ],
  },
  Lato: {
    label: "Lato",
    name: "Lato",
    note: "A humanist sans serif with open, rounded letterforms.",
    files: [
      "Lato-Regular.ttf",
      "Lato-Bold.ttf",
      "Lato-Italic.ttf",
      "Lato-BoldItalic.ttf",
    ],
  },
  SourceSans3: {
    label: "Source Sans 3",
    name: "Source Sans 3",
    note: "Adobe's readable sans serif for labels and annotations.",
    files: [
      "SourceSans3-Regular.ttf",
      "SourceSans3-Bold.ttf",
      "SourceSans3-It.ttf",
      "SourceSans3-BoldIt.ttf",
    ],
  },
  SourceSerif4: {
    label: "Source Serif 4",
    name: "Source Serif 4",
    note: "Adobe's serif family for a more traditional figure style.",
    files: [
      "SourceSerif4-Regular.ttf",
      "SourceSerif4-Bold.ttf",
      "SourceSerif4-It.ttf",
      "SourceSerif4-BoldIt.ttf",
    ],
  },
} as const;

export type FontFamily = keyof typeof FONT_CATALOG;
export const FONT_FAMILIES = Object.keys(FONT_CATALOG) as FontFamily[];
