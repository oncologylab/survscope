import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("icon commands expose hover and keyboard help without losing editing shortcuts", async ({
  page,
}) => {
  await page.goto("");
  await expect(page.locator("svg.survival-plot")).toBeVisible();
  const save = page.getByRole("button", { name: "Save project", exact: true });
  await expect(save.locator("svg")).toBeVisible();
  await expect(save).toHaveText("");
  await save.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Save project");
  await page.mouse.move(0, 0);
  await save.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  await page.locator('[data-element="title"]').click();
  const arrange = page.getByLabel("Arrange selection (1)", { exact: true });
  await expect(arrange).toHaveText("1");
  const artboard = page.getByRole("button", {
    name: "Align to artboard",
    exact: true,
  });
  await artboard.focus();
  await page.keyboard.press("Space");
  await expect(artboard).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Align left", exact: true }).hover();
  await expect(page.getByRole("tooltip")).toContainText("Align left");
  await expect(
    page.getByRole("button", { name: "Copy", exact: true }),
  ).toBeDisabled();
  await page.mouse.move(0, 0);
  await expect(
    page.getByText("Double-click text to type directly on the figure.", {
      exact: true,
    }),
  ).toHaveCount(0);

  await page.locator('[data-element="title"]').dblclick();
  const editor = page.getByRole("textbox", { name: "Edit plot text" });
  await editor.fill("Styled title");
  await editor.press("ControlOrMeta+a");
  await page
    .getByRole("button", { name: "Italic selection", exact: true })
    .click();
  await expect(editor).toBeFocused();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.locator('[data-element="title"] tspan[font-style="italic"]'),
  ).toContainText("Styled title");
});

test("all font families load locally and the new fonts survive vector export and reopening", async ({
  page,
}) => {
  const external: string[] = [],
    failed: string[] = [],
    errors: string[] = [];
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).hostname !== "127.0.0.1"
    )
      external.push(request.url());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failed.push(response.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("");
  await expect(page.locator("svg.survival-plot")).toBeVisible();
  for (const family of [
    "Sans",
    "Serif",
    "Mono",
    "Carlito",
    "Lato",
    "SourceSans3",
    "SourceSerif4",
  ]) {
    await page.getByLabel("Font", { exact: true }).selectOption(family);
    const loaded = await page.evaluate(async (name) => {
      const faces = await document.fonts.load(
        `bold 12px "SurvScope ${name}"`,
        "αβ Survival 0123",
      );
      return (
        faces.length > 0 && faces.every((face) => face.status === "loaded")
      );
    }, family);
    expect(loaded).toBe(true);
    await expect(page.locator("svg.survival-plot")).toHaveCSS(
      "font-family",
      new RegExp(`^"?SurvScope ${family}"?$`),
    );
    const expected = await page
      .locator('[data-text-id="title"]')
      .evaluate((node) => {
        const text = node as SVGTextElement;
        const point = text
          .getStartPositionOfChar(0)
          .matrixTransform(text.getScreenCTM()!);
        return {
          x: point.x,
          y: point.y,
          width: text.getBoundingClientRect().width,
        };
      });
    await page.locator('[data-element="title"]').dblclick();
    const editor = page.getByRole("textbox", { name: "Edit plot text" });
    const actual = await editor.evaluate((node) => {
      const marker = document.createElement("span");
      Object.assign(marker.style, {
        display: "inline-block",
        width: "0",
        height: "0",
        verticalAlign: "baseline",
      });
      node.querySelector("p")!.prepend(marker);
      const rect = marker.getBoundingClientRect();
      marker.remove();
      return {
        x: rect.x,
        y: rect.y,
        width: node.getBoundingClientRect().width,
      };
    });
    expect(Math.abs(actual.x - expected.x)).toBeLessThan(4);
    expect(Math.abs(actual.y - expected.y)).toBeLessThan(2);
    expect(Math.abs(actual.width - expected.width)).toBeLessThan(4);
    await editor.press("Escape");
  }
  await page.getByLabel("Selected item", { exact: true }).selectOption("title");
  await page
    .getByLabel("Selected font", { exact: true })
    .selectOption("SourceSans3");
  await page.getByRole("button", { name: "Italic text", exact: true }).click();
  for (const kind of ["SVG", "PDF", "Save project"] as const) {
    const promise = page.waitForEvent("download");
    await page.getByRole("button", { name: kind, exact: true }).click();
    const path = (await (await promise).path())!;
    const content = readFileSync(path, "utf8");
    if (kind === "SVG") {
      expect(content).toContain('width="6.8in"');
      expect(content).toContain("SurvScope SourceSans3");
      expect(content).toContain("SurvScope SourceSerif4");
      expect(content.match(/data:font\/ttf;base64/g)).toHaveLength(8);
      expect(content).not.toContain("command-icon");
    } else if (kind === "PDF") {
      expect(content).toContain("/FontFile2");
      const names = content.match(/\/(?:BaseFont|FontName) [^\r\n]+/g) ?? [];
      expect(names.some((name) => name.includes("SourceSans3"))).toBe(true);
      expect(names.some((name) => name.includes("SourceSerif4"))).toBe(true);
    } else {
      expect(JSON.parse(content).settings.fontFamily).toBe("SourceSerif4");
      await page
        .getByRole("button", { name: "New analysis", exact: true })
        .click();
      await page.getByLabel("Open figure file").setInputFiles(path);
      await expect(page.getByLabel("Font", { exact: true })).toHaveValue(
        "SourceSerif4",
      );
      await page
        .getByLabel("Selected item", { exact: true })
        .selectOption("title");
      await expect(
        page.getByLabel("Selected font", { exact: true }),
      ).toHaveValue("SourceSans3");
    }
  }
  expect(external).toEqual([]);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});
