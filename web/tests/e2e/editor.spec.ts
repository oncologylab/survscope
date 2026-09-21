import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

async function number(page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press("Enter");
}
async function download(page: Page, name: string) {
  const ready = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  return (await ready).path();
}

test("edits text, drags and nudges elements, resizes panels, and restores a saved project", async ({
  page,
}) => {
  await page.goto("?gene=SRD5A1&cohort=PAAD&cutoff=median");
  await expect(page.locator("svg.survival-plot")).toBeVisible();
  await expect(page.locator("svg.survival-plot")).toBeVisible();
  const title = page.locator('[data-element="title"]');
  await title.click();
  await page
    .getByLabel("Text", { exact: true })
    .fill("My survival figure\nExploratory comparison");
  await expect(title.locator("text > tspan")).toHaveCount(2);
  await title.click();
  await page.keyboard.press("ArrowRight");
  await expect(title).toHaveAttribute("transform", "translate(1,0)");
  await page.keyboard.press("Control+z");
  await expect(title).toHaveAttribute("transform", "translate(0,0)");
  const box = (await title.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 30,
    box.y + box.height / 2 + 15,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(title).not.toHaveAttribute("transform", "translate(0,0)");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(title).toHaveAttribute("transform", "translate(0,0)");
  await page
    .getByLabel("Selected item", { exact: true })
    .selectOption("panel.OS");
  const handle = page.getByLabel("Resize panel");
  const h = (await handle.boundingBox())!;
  const previous = Number(
    await page.getByLabel("Panel width (pt)", { exact: true }).inputValue(),
  );
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 20, h.y + h.height / 2 + 15, {
    steps: 5,
  });
  await page.mouse.up();
  await expect
    .poll(async () =>
      Number(
        await page.getByLabel("Panel width (pt)", { exact: true }).inputValue(),
      ),
    )
    .toBeGreaterThan(previous);
  const saved = (await download(page, "Save project"))!;
  const file = JSON.parse(readFileSync(saved, "utf8"));
  expect(file.settings.elements.title.text).toContain("My survival figure");
  await page.getByRole("button", { name: "Reset figure", exact: true }).click();
  await expect(title).toContainText("SRD5A1 TCGA-PAAD survival");
  await page.getByLabel("Open figure file").setInputFiles(saved);
  await expect(title).toContainText("My survival figure");
  await expect(page.getByLabel("Selected item", { exact: true })).toHaveValue(
    "",
  );
});

test("exports edited physical dimensions, embedded fonts, overlays, and clean vector files", async ({
  page,
}) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().startsWith("http") && new URL(r.url()).hostname !== "127.0.0.1")
      external.push(r.url());
  });
  await page.goto("?gene=SRD5A1&cohort=PAAD&cutoff=median");
  await expect(page.locator("svg.survival-plot")).toBeVisible();
  await number(page, "Width (inches)", "8");
  await number(page, "Height (inches)", "5");
  await expect(page.locator("svg.survival-plot")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  const paper = (await page.locator("svg.survival-plot > rect").boundingBox())!;
  expect(paper.width / paper.height).toBeCloseTo(8 / 5, 3);
  await page.getByLabel("Font", { exact: true }).selectOption("Serif");
  await page.getByText("Survival details", { exact: true }).click();
  for (const label of [
    "Confidence bands",
    "Censor marks",
    "Number-at-risk tables",
  ])
    await page.getByLabel(label, { exact: true }).check();
  await page
    .getByLabel("Confidence level", { exact: true })
    .selectOption("0.99");
  await expect(page.locator("[data-confidence]")).toHaveCount(8);
  await expect(page.locator("[data-risk-table]")).toHaveCount(4);
  expect(await page.locator("[data-censor]").count()).toBeGreaterThan(0);
  await page.getByText("Axes", { exact: true }).click();
  await page.getByLabel("Time unit", { exact: true }).selectOption("years");
  await number(page, "Time ends at", "10");
  await number(page, "Time tick spacing", "2");
  await page.getByText("Export and reuse", { exact: true }).click();
  await page.getByLabel("PNG resolution", { exact: true }).selectOption("150");
  const svg = readFileSync((await download(page, "SVG"))!, "utf8");
  expect(svg).toContain('width="8in"');
  expect(svg).toContain('height="5in"');
  expect(svg).toContain("data:font/ttf;base64,");
  expect(svg).toContain("SurvScope Serif");
  expect(svg).not.toContain("data-editor-only");
  expect(svg).not.toContain("data-element=");
  const png = readFileSync((await download(page, "PNG"))!);
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(750);
  const resolution = png.indexOf(Buffer.from("pHYs"));
  expect(resolution).toBeGreaterThan(0);
  expect(png.readUInt32BE(resolution + 4)).toBe(Math.round(150 / 0.0254));
  expect(png[resolution + 12]).toBe(1);
  const pdf = readFileSync((await download(page, "PDF"))!, "latin1");
  expect(pdf).toMatch(/\/MediaBox\s*\[0 0 576(?:\.0*)? 360(?:\.0*)?\]/);
  expect(pdf).toContain("/FontFile2");
  const json = JSON.parse(
    readFileSync((await download(page, "JSON"))!, "utf8"),
  );
  expect(json.endpoints.OS.n).toBe(177);
  expect(json.endpoints.OS.logrankP).toBeCloseTo(0.0017777122420538, 12);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("previews percentile groups and preserves style across analyses while refreshing labels", async ({
  page,
}) => {
  await page.goto("?gene=SRD5A1&cohort=PAAD&cutoff=median");
  await expect(page.locator("svg.survival-plot")).toBeVisible();
  await page
    .getByLabel("Compare expression groups", { exact: true })
    .selectOption("quarters");
  await expect(page.getByLabel("Group sizes before analysis")).toContainText(
    "middle excluded",
  );
  await expect(
    page.getByText("Selections changed.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create survival plot", exact: true })
    .click();
  await expect(page.locator('[data-element="grouping"]')).toContainText(
    "Lowest 25%",
  );
  await expect(page).toHaveURL(/grouping=percentile_groups/);
  await expect(page.locator("svg.survival-plot")).toBeVisible();
  await page.getByLabel("Font", { exact: true }).selectOption("Mono");
  await page.getByLabel("Selected item", { exact: true }).selectOption("title");
  await page.getByLabel("Text", { exact: true }).fill("Old gene title");
  await page.getByText("Legend and annotations", { exact: true }).click();
  await page.getByRole("button", { name: "Add arrow", exact: true }).click();
  await expect(page.locator('[data-element^="annotation."]')).toHaveCount(1);

  await page
    .getByLabel("Gene symbol or Ensembl ID", { exact: true })
    .fill("ITGA2");
  await page
    .getByRole("button", { name: "Create survival plot", exact: true })
    .click();
  await expect(page.locator('[data-element="title"]')).toContainText("ITGA2");
  await expect(page.locator('[data-element^="annotation."]')).toHaveCount(0);
  await expect(page.locator("svg.survival-plot")).toHaveCSS(
    "font-family",
    /^"?SurvScope Mono"?$/,
  );
});

test("opens archived results without silently recomputing and rejects malformed files", async ({
  page,
}) => {
  await page.goto("?gene=SRD5A1&cohort=PAAD&cutoff=median");
  const saved = (await download(page, "Save project"))!;
  const file = JSON.parse(readFileSync(saved, "utf8"));
  file.version = 1;
  delete file.analysis.provenance;
  file.analysis.dataVersion = "2020.01.01";
  await page.getByLabel("Open figure file").setInputFiles({
    name: "old.survscope.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(page.locator(".data-version")).toContainText("2020.01.01");

  await page
    .getByRole("button", { name: "Create survival plot", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Choose New analysis");
  await page.getByLabel("Open figure file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.getByRole("status")).toContainText("unsupported");
  await expect(page.locator(".data-version")).toContainText("2020.01.01");
});

test("keeps the guide and editor usable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("");
  await page.getByRole("button", { name: "How to use", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator("svg.survival-plot")).toBeVisible();
  await page.getByRole("button", { name: "Toggle Properties panel" }).click();
  await expect(page.getByLabel("Figure properties")).toBeVisible();
  await page.getByLabel("Selected item", { exact: true }).selectOption("title");
  await page.getByLabel("Text", { exact: true }).fill("Mobile edit");
  await expect(page.locator('[data-element="title"]')).toContainText(
    "Mobile edit",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("reuses presets, rearranges outcomes, and applies consistent axes to all panels", async ({
  page,
}) => {
  await page.goto("");
  await expect(page.locator("svg.survival-plot")).toBeVisible();
  await page.getByLabel("Font", { exact: true }).selectOption("Mono");
  await page.getByText("Outcomes and layout", { exact: true }).click();
  await page.getByLabel("Move DSS earlier").click();
  await page.getByLabel("DFI", { exact: true }).uncheck();
  await expect(page.locator('[data-element="panel.DFI"]')).toHaveCount(0);
  await page.getByText("Axes", { exact: true }).click();
  await page
    .getByLabel("Apply axis settings to", { exact: true })
    .selectOption("OS");
  await number(page, "Time starts at", "50");
  await page
    .getByLabel("Apply axis settings to", { exact: true })
    .selectOption("all");
  // The first visible outcome is DSS, whose minimum is still zero.
  await number(page, "Time ends at", "20");
  const project = JSON.parse(
    readFileSync((await download(page, "Save project"))!, "utf8"),
  );
  for (const ep of ["OS", "DSS", "PFI", "DFI"]) {
    expect(project.settings.axes[ep].xMin).toBe(0);
    expect(project.settings.axes[ep].xMax).toBe(20);
  }
  await page.getByText("Export and reuse", { exact: true }).click();
  const preset = (await download(page, "Save style preset"))!;
  await page.getByRole("button", { name: "Reset figure", exact: true }).click();
  await expect(page.locator('[data-element="panel.DFI"]')).toHaveCount(1);
  await page.getByLabel("Open figure file").setInputFiles(preset);
  await expect(page.getByLabel("Font", { exact: true })).toHaveValue("Mono");
  await expect(page.locator('[data-element="panel.DFI"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Hand tool", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Hand tool", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const stage = page.locator(".plot-stage"),
    b = (await stage.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 80, b.y + b.height / 2 - 60);
  await page.mouse.up();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expect(stage).toHaveClass(/fitted/);
});

test("reading the guide does not move or undo a selected figure item", async ({
  page,
}) => {
  await page.goto("");
  await expect(page.locator("svg.survival-plot")).toBeVisible();
  const title = page.locator('[data-element="title"]');
  await title.click();
  await page.keyboard.press("ArrowRight");
  await expect(title).toHaveAttribute("transform", "translate(1,0)");
  await page.getByRole("button", { name: "How to use", exact: true }).click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Control+z");
  await expect(title).toHaveAttribute("transform", "translate(1,0)");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
