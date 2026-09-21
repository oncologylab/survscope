import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
async function start(page: Page) {
  await page.goto("");
  await expect(page.locator("svg.survival-plot")).toBeVisible();
}
async function saved(page: Page) {
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const file = await promise;
  return JSON.parse(readFileSync((await file.path())!, "utf8"));
}
async function inspector(page: Page) {
  if (!(await page.getByLabel("Figure properties").isVisible()))
    await page.getByRole("button", { name: "Toggle Properties panel" }).click();
}

test("edits characters directly and saves an active editing session with rich formatting", async ({
  page,
}) => {
  await start(page);
  const title = page.locator('[data-element="title"]');
  await title.dblclick();
  const input = page.getByRole("textbox", { name: "Edit plot text" });
  await expect(input).toBeFocused();
  await input.fill("TP53 2");
  await input.press("End");
  await input.press("Shift+ArrowLeft");
  await page.getByRole("button", { name: "Superscript selection" }).click();
  const file = await saved(page);
  expect(file.version).toBe(2);
  expect(file.settings.elements.title.text).toBe("TP53 2");
  expect(file.settings.elements.title.runs.at(-1)).toMatchObject({
    text: "2",
    script: "super",
  });
  await expect(input).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(title).toContainText("SRD5A1 TCGA-PAAD survival");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(title).toContainText("TP53 2");
  await title.dblclick();
  await input.press("ControlOrMeta+a");
  await input.press("ControlOrMeta+b");
  await input.press("ControlOrMeta+i");
  await input.press("Escape");
  const rich = (await saved(page)).settings.elements.title.runs;
  expect(rich.every((r: any) => !r.bold && r.italic)).toBe(true);
});

test("edits rotated multiline text and whole legend entries without changing analysis", async ({
  page,
}) => {
  await start(page);
  await page.locator('[data-element="ylabel.OS"]').dblclick();
  const input = page.getByRole("textbox", { name: "Edit plot text" });
  await input.fill("Survival β");
  await input.press("End");
  await input.press("Enter");
  await input.pressSequentially("Probability");
  await input.press("Escape");
  await expect(page.locator('[data-element="ylabel.OS"]')).toContainText(
    "Survival βProbability",
  );
  const before = await saved(page);
  const os = before.analysis.endpoints.OS;
  const label = page.locator('[data-text-id="label.low.OS"]');
  const dssLabel = page.locator('[data-text-id="label.low.DSS"]');
  const dssBefore = await dssLabel.textContent();
  await label.dblclick();
  await expect(input).toHaveText(`Low n=${os.low.n}, e=${os.low.events}`);
  const fullLabel = `Lower RNA (participants = ${os.low.n}; observed events = ${os.low.events})`;
  await input.fill(fullLabel);
  await input.press("ControlOrMeta+a");
  await input.press("ControlOrMeta+i");
  await input.press("Escape");
  await expect(label).toHaveText(fullLabel);
  await expect(dssLabel).toHaveText(dssBefore!);
  const file = await saved(page);
  expect(file.settings.elements["label.low.OS"].text).toBe(fullLabel);
  expect(file.settings.lowLabel).toBe("Low");
  expect(file.analysis).toEqual(before.analysis);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(label).toHaveText(`Low n=${os.low.n}, e=${os.low.events}`);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(label).toHaveText(fullLabel);
  await page.getByLabel("Open figure file").setInputFiles({
    name: "edited-legend.survscope.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(label).toHaveText(fullLabel);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "SVG", exact: true }).click();
  const svg = readFileSync((await (await download).path())!, "utf8");
  expect(svg).toContain(fullLabel);
  await page
    .getByLabel("Selected item", { exact: true })
    .selectOption("label.low.OS");
  await page
    .getByRole("button", { name: "Reset selected item", exact: true })
    .click();
  await expect(label).toHaveText(`Low n=${os.low.n}, e=${os.low.events}`);
  await page.getByText("Legend and annotations", { exact: true }).click();
  await page.getByLabel("Lower group label").fill("Low group");
  await expect(label).toContainText("Low group n=");
  await expect(dssLabel).toContainText("Low group n=");
  expect(file.analysis.endpoints.OS.n).toBe(177);
  expect(file.analysis.endpoints.OS.logrankP).toBeCloseTo(
    0.0017777122420538,
    12,
  );
  await page.getByLabel("Selected item", { exact: true }).selectOption("title");
  await page.getByLabel("Selected font").selectOption("Serif");
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "SVG", exact: true }).click();
  const content = readFileSync((await (await promise).path())!, "utf8");
  expect(content).toContain("SurvScope Serif");
  expect(content).toContain("SurvScope Sans");
  expect(content).toContain("provenance");
  expect(content).not.toContain("data-editor-only");
});

test("supports multiple selection, alignment, layers, locking and history", async ({
  page,
}) => {
  await start(page);
  await page.locator('[data-element="title"]').click();
  await page.locator('[data-element="source"]').click({ modifiers: ["Shift"] });
  await expect(
    page.getByLabel("Arrange selection (2)", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Shift+ArrowRight");
  const file = await saved(page);
  expect(file.settings.elements.title.dx).toBe(10);
  expect(file.settings.elements.source.dx).toBe(10);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("tab", { name: "Layers", exact: true }).click();
  await page.getByRole("button", { name: "Lock Title", exact: true }).click();
  await page.locator('[data-element="title"]').click();
  await page.keyboard.press("ArrowRight");
  expect((await saved(page)).settings.elements.title.dx ?? 0).toBe(0);
  await page.getByRole("button", { name: "Hide Title", exact: true }).click();
  await expect(page.locator('[data-element="title"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator('[data-element="title"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Lock Title", exact: true }).click();
  await page.getByRole("tab", { name: "Properties", exact: true }).click();
  await page.getByLabel("Selected item", { exact: true }).selectOption("title");
  await page
    .getByRole("button", { name: "Align to artboard", exact: true })
    .click();
  await page.getByRole("button", { name: "Align left", exact: true }).click();
  expect((await saved(page)).settings.elements.title.dx).toBeLessThan(0);
});

test("opens shared rich legends from older projects and formats the complete entry", async ({
  page,
}) => {
  await start(page);
  const file = await saved(page);
  file.settings.lowLabel = "Lower RNA";
  file.settings.elements["label.low"] = {
    runs: [{ text: "Lower RNA", italic: true }],
  };
  file.settings.elements["legend.OS"] = { dx: 9, dy: 6 };
  await page
    .getByLabel("Open figure file")
    .setInputFiles({
      name: "older-project.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(file)),
    });
  const label = page.locator('[data-text-id="label.low.OS"]');
  const value = `Lower RNA n=${file.analysis.endpoints.OS.low.n}, e=${file.analysis.endpoints.OS.low.events}`;
  await expect(label).toHaveText(value);
  await expect(label.locator('tspan[font-style="italic"]')).toContainText(
    "Lower RNA",
  );
  await label.dblclick();
  const editor = page.getByRole("textbox", { name: "Edit plot text" });
  await expect(editor).toHaveText(value);
  await editor.press("Escape");
  await expect(
    page.getByLabel("Horizontal offset (pt)", { exact: true }),
  ).toHaveValue("0");
  await page.getByRole("button", { name: "Bold text", exact: true }).click();
  await expect(label).toHaveText(value);
  await expect(label.locator('tspan[font-weight="700"]')).toHaveCount(0);
  expect((await saved(page)).analysis).toEqual(file.analysis);
});

test("creates text and line annotations with tools, duplicates, reorders and deletes them", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Type tool", exact: true }).click();
  const canvas = (await page.locator("svg.survival-plot").boundingBox())!;
  await page.mouse.click(
    canvas.x + canvas.width * 0.5,
    canvas.y + canvas.height * 0.54,
  );
  const input = page.getByRole("textbox", { name: "Edit plot text" });
  await input.fill("Note");
  await input.press("Escape");
  await expect(page.locator('[data-element^="annotation."]')).toHaveCount(1);
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.locator('[data-element^="annotation."]')).toHaveCount(2);
  await page.getByRole("button", { name: "Send to back", exact: true }).click();
  const first = (await saved(page)).settings.annotations[0];
  expect(first.text).toBe("Note");
  await page.getByRole("button", { name: "Arrow tool", exact: true }).click();
  await page.mouse.move(
    canvas.x + canvas.width * 0.58,
    canvas.y + canvas.height * 0.52,
  );
  await page.mouse.down();
  await page.mouse.move(
    canvas.x + canvas.width * 0.5,
    canvas.y + canvas.height * 0.45,
    { steps: 5 },
  );
  await page.mouse.up();
  const arrow = (await saved(page)).settings.annotations.at(-1);
  expect(arrow.kind).toBe("arrow");
  await page
    .getByRole("button", { name: "Selection tool", exact: true })
    .click();
  const endpoint = page.getByLabel("Move line endpoint");
  const handle = (await endpoint.boundingBox())!;
  expect(handle.x + handle.width / 2).toBeCloseTo(
    canvas.x + arrow.x2 * canvas.width,
    0,
  );
  expect(handle.y + handle.height / 2).toBeCloseTo(
    canvas.y + arrow.y2 * canvas.height,
    0,
  );
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.width / 2 - 15,
    handle.y + handle.height / 2 + 20,
    { steps: 5 },
  );
  const line = page.locator(`[data-element="annotation.${arrow.id}"] line`);
  await expect
    .poll(async () => Number(await line.getAttribute("y2")))
    .toBeCloseTo((arrow.y2 + 20 / canvas.height) * 6.8 * 72, 3);
  await page.mouse.up();
  const resized = (await saved(page)).settings.annotations.at(-1);
  expect(resized.x).toBe(arrow.x);
  expect(resized.y).toBe(arrow.y);
  expect(resized.x2).toBeCloseTo(arrow.x2 - 15 / canvas.width, 5);
  expect(resized.y2).toBeCloseTo(arrow.y2 + 20 / canvas.height, 5);
  await page
    .getByRole("button", { name: "Delete annotations", exact: true })
    .click();
  await expect(page.locator('[data-element^="annotation."]')).toHaveCount(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator('[data-element^="annotation."]')).toHaveCount(3);
});

test("citations follow the displayed analysis, with methods, BibTeX and RIS exports", async ({
  page,
  browserName,
  context,
}) => {
  if (browserName === "chromium")
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await start(page);
  await page
    .getByLabel("Gene symbol or Ensembl ID", { exact: true })
    .fill("ITGA2");
  await page
    .getByRole("button", { name: "Cite this analysis", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Cite this analysis" });
  await expect(dialog).toContainText("SRD5A1 · PAAD");
  await expect(dialog).toContainText(
    "An Integrated TCGA Pan-Cancer Clinical Data Resource",
  );
  await expect(page.getByLabel("Methods and acknowledgement")).toHaveValue(
    /SRD5A1/,
  );
  await page
    .getByRole("button", { name: "Copy references", exact: true })
    .click();
  if (browserName === "chromium")
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      "10.1016/j.cell.2018.02.052",
    );
  for (const [name, fragment] of [
    ["Download BibTeX", "@article{liu2018cdr"],
    ["Download RIS", "TY  - JOUR"],
  ]) {
    const promise = page.waitForEvent("download");
    await page.getByRole("button", { name, exact: true }).click();
    expect(readFileSync((await (await promise).path())!, "utf8")).toContain(
      fragment,
    );
  }
  await page.getByRole("button", { name: "Close citations" }).click();
  await page
    .getByLabel("Compare expression groups", { exact: true })
    .selectOption({ label: "Custom percentile groups" });
  await page.getByLabel("Lowest (%)").fill("20");
  await page.getByLabel("Highest (%)").fill("30");
  await page.getByRole("button", { name: "Create survival plot" }).click();
  await expect(page).toHaveURL(/grouping=percentile_groups/);
});

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
  { width: 1366, height: 768 },
  { width: 1440, height: 600 },
  { width: 1024, height: 768 },
  { width: 960, height: 540 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
])
  test(`workspace fits ${viewport.width} × ${viewport.height} and zoom grows from Fit`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await start(page);
    const main = (await page.locator("main").boundingBox())!,
      before = (await page.locator(".figure-canvas").boundingBox())!;
    expect(main.width).toBeGreaterThan(viewport.width - 40);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth + 1 &&
          document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    ).toBe(true);
    const footer = (await page.locator("footer").boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(viewport.height + 1);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    expect(
      (await page.locator(".figure-canvas").boundingBox())!.width,
    ).toBeGreaterThan(before.width);
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    expect(
      (await page.locator(".figure-canvas").boundingBox())!.width,
    ).toBeCloseTo(before.width, 0);
    if (viewport.width < 1024) {
      await inspector(page);
      await expect(page.getByLabel("Width (inches)")).toBeVisible();
      await page
        .getByRole("button", { name: "Close Properties panel" })
        .click();
    }
  });

test("all comparison controls run, and legacy links normalize without changing membership", async ({
  page,
}) => {
  await page.goto(
    "?gene=SRD5A1&cohort=PAAD&grouping=extremes&lower=20&upper=30",
  );
  await expect(page.locator("svg.survival-plot")).toBeVisible();
  await expect(
    page.getByLabel("Compare expression groups", { exact: true }),
  ).toHaveValue("percentile_groups");
  for (const mode of [
    "median",
    "mean",
    "percentile",
    "quarters",
    "thirds",
    "percentile_groups",
    "tpm",
  ]) {
    await page
      .getByLabel("Compare expression groups", { exact: true })
      .selectOption(mode);
    await page.getByRole("button", { name: "Create survival plot" }).click();
    await expect(page.locator(".pending-status")).toHaveCount(0);
    expect((await saved(page)).analysis.endpoints.OS.eligibleN).toBe(177);
  }
  await page
    .getByLabel("Compare expression groups", { exact: true })
    .selectOption("percentile_groups");
  await page.getByLabel("Lowest (%)").fill("80");
  await page.getByLabel("Highest (%)").fill("60");
  await expect(
    page.getByRole("button", { name: "Create survival plot" }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("at most 100");
});

test("canvas text tracks screen magnification; styled annotations can be removed and saved", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const title = page.locator('[data-element="title"]');
  const before = (await title.boundingBox())!;
  // A real pointer click preserves this view. Firefox's locator auto-scroll
  // can scroll the entire SVG before clicking a partially clipped text box.
  await page.mouse.dblclick(
    before.x + before.width / 2,
    before.y + before.height / 2,
  );
  const input = page.getByRole("textbox", { name: "Edit plot text" });
  const box = (await input.boundingBox())!;
  expect(Math.abs(box.x - before.x)).toBeLessThan(4);
  expect(Math.abs(box.width - before.width)).toBeLessThan(4);
  await input.press("Escape");
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.getByText("Legend and annotations", { exact: true }).click();
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await page.locator('[data-element^="annotation."]').dblclick();
  await input.fill("A note β");
  await input.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Italic selection" }).click();
  await input.press("Escape");
  await page
    .getByRole("button", { name: "Remove annotation", exact: true })
    .click();
  const file = await saved(page);
  expect(file.settings.annotations).toHaveLength(0);
  expect(
    Object.keys(file.settings.elements).some((k) =>
      k.startsWith("annotation."),
    ),
  ).toBe(false);
});

test("scaled 4K remains full-width, supports the zoom tool and temporary Hand shortcut", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173/survscope/");
  await expect(page.locator("svg.survival-plot")).toBeVisible();
  expect((await page.locator("main").boundingBox())!.width).toBeGreaterThan(
    1880,
  );
  const size = (await page.locator(".figure-canvas").boundingBox())!.width;
  await page.keyboard.press("z");
  await page.locator('[data-element="title"]').click();
  expect(
    (await page.locator(".figure-canvas").boundingBox())!.width,
  ).toBeGreaterThan(size);
  await page.keyboard.press("v");
  await page.keyboard.down("Space");
  await expect(page.getByRole("button", { name: "Hand tool" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.up("Space");
  await expect(
    page.getByRole("button", { name: "Selection tool" }),
  ).toHaveAttribute("aria-pressed", "true");
  await context.close();
});

test("marquee selection moves annotations together in one undoable gesture and copies their formatting", async ({
  page,
}) => {
  await start(page);
  const file = await saved(page);
  file.settings.endpoints = ["OS"];
  file.settings.annotations = [0.2, 0.5, 0.8].map((x, i) => ({
    id: `group-${i}`,
    kind: "text",
    text: `Note ${i + 1}`,
    x,
    y: 0.7,
    x2: x + 0.05,
    y2: 0.75,
    color: "#123456",
    fontSize: 10,
    lineWidth: 1,
  }));
  await page.getByLabel("Open figure file").setInputFiles({
    name: "selection.survscope.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(file)),
  });
  const first = page.locator('[data-element="annotation.group-0"]');
  await expect(first).toBeVisible();
  await page.getByLabel("Snap to objects").uncheck();
  const canvas = (await page.locator("svg.survival-plot").boundingBox())!;
  await page.mouse.move(
    canvas.x + canvas.width * 0.1,
    canvas.y + canvas.height * 0.64,
  );
  await page.mouse.down();
  await page.mouse.move(
    canvas.x + canvas.width * 0.94,
    canvas.y + canvas.height * 0.78,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(
    page.getByLabel("Arrange selection (3)", { exact: true }),
  ).toBeVisible();
  const box = (await first.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 40,
    box.y + box.height / 2 + 12,
    { steps: 8 },
  );
  await page.mouse.up();
  const changed = await saved(page);
  for (let i = 0; i < 3; i++) {
    expect(
      changed.settings.annotations[i].x - file.settings.annotations[i].x,
    ).toBeCloseTo(40 / canvas.width, 5);
    expect(
      changed.settings.annotations[i].y - file.settings.annotations[i].y,
    ).toBeCloseTo(12 / canvas.height, 5);
  }
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await saved(page)).settings.annotations).toEqual(
    file.settings.annotations,
  );
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  const pasted = await saved(page);
  expect(pasted.settings.annotations).toHaveLength(6);
  expect(pasted.settings.annotations[3].color).toBe("#123456");
});

test("dock widths persist and keyboard resizing leaves the selected artwork unchanged", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await start(page);
  await page.locator('[data-element="title"]').click();
  const left = page.getByRole("separator", { name: "Resize Analysis panel" });
  await left.focus();
  await left.press("ArrowRight");
  await expect(left).toHaveAttribute("aria-valuenow", "290");
  const right = page.getByRole("separator", {
    name: "Resize Properties panel",
  });
  await right.focus();
  await right.press("ArrowLeft");
  await expect(right).toHaveAttribute("aria-valuenow", "330");
  await expect(page.locator('[data-element="title"]')).toHaveAttribute(
    "transform",
    "translate(0,0)",
  );
  const handle = (await right.boundingBox())!;
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle.x - 40 + handle.width / 2,
    handle.y + handle.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(right).toHaveAttribute("aria-valuenow", "370");
  await page.reload();
  await expect(left).toHaveAttribute("aria-valuenow", "290");
  await expect(right).toHaveAttribute("aria-valuenow", "370");
  await page
    .getByRole("button", { name: "Reset workspace", exact: true })
    .click();
  await expect(left).toHaveAttribute("aria-valuenow", "280");
  await expect(right).toHaveAttribute("aria-valuenow", "320");
});
