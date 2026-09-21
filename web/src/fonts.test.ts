import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { FONT_CATALOG, FONT_FAMILIES } from "./fontCatalog";
import { defaultFigure } from "./figure";
import { readFigureFile, presetFile } from "./project";

describe("portable figure fonts", () => {
  test("every selectable family has four matching local TrueType faces and CSS rules", () => {
    const css = readFileSync(resolve("src/fonts.css"), "utf8");
    const expected = new Set<string>();
    for (const family of FONT_FAMILIES) {
      for (const file of FONT_CATALOG[family].files) {
        const bytes = readFileSync(resolve("public/fonts", file));
        expect([...bytes.subarray(0, 4)]).toEqual([0, 1, 0, 0]);
        const rule = css
          .split("}")
          .find((value) => value.includes(`/fonts/${file}`));
        expect(rule).toContain(`font-family: "SurvScope ${family}"`);
        expected.add(file);
      }
    }
    expect(
      [...css.matchAll(/\/fonts\/([^"/]+\.ttf)/g)].map((m) => m[1]).sort(),
    ).toEqual([...expected].sort());
  });

  test("new bundled font assets match their pinned sources and include license notices", () => {
    const sources = JSON.parse(
      readFileSync(resolve("public/fonts/sources.json"), "utf8"),
    );
    for (const source of sources) {
      expect(
        readFileSync(resolve("public/fonts", source.licenseFile), "utf8"),
      ).toContain("SIL OPEN FONT LICENSE");
      for (const asset of source.files) {
        expect(asset.source).toContain(source.revision);
        expect(
          createHash("sha256")
            .update(readFileSync(resolve("public/fonts", asset.file)))
            .digest("hex"),
        ).toBe(asset.sha256);
      }
    }
  });

  test("presets preserve each family globally and on individual objects", () => {
    for (const family of FONT_FAMILIES) {
      const settings = defaultFigure();
      settings.fontFamily = family;
      settings.elements.title = { fontFamily: family };
      const file = readFigureFile(JSON.stringify(presetFile(settings)));
      expect(file.settings.fontFamily).toBe(family);
      expect(file.settings.elements.title.fontFamily).toBe(family);
    }
    const invalid = presetFile(defaultFigure());
    (invalid.settings as { fontFamily: string }).fontFamily =
      "https://untrusted.example/font.ttf";
    expect(() => readFigureFile(JSON.stringify(invalid))).toThrow(
      /unsupported/,
    );
  });
});
