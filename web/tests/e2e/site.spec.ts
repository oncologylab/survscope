import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("renders the reference plot without external runtime requests", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") externalRequests.push(request.url());
  });
  await page.goto("?gene=SRD5A1&cohort=PAAD&cutoff=median");
  await expect(
    page.getByRole("link", { name: "SurvScope", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Toggle Analysis panel" }).click();
  await expect(page.getByLabel("Cancer cohort")).toBeVisible();
  await expect(page.getByText("Transparent by design")).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "SRD5A1 TCGA-PAAD survival" }),
  ).toBeVisible();
  await expect(page.locator("svg.survival-plot")).not.toContainText("q=");
  await expect(page.getByText("recommended", { exact: true })).toHaveCount(4);
  await expect(page.getByText(/n=177 · events=93/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight + 1,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".controls")
      .evaluate((element) => element.clientHeight > 0),
  ).toBe(true);
  await expect(page.locator("footer")).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test("supports custom cutoffs and all figure download controls", async ({
  page,
}) => {
  await page.goto("?gene=ITGA2&cohort=PAAD&cutoff=median");
  await expect(
    page.getByRole("img", { name: "ITGA2 TCGA-PAAD survival" }),
  ).toBeVisible();
  await page
    .getByLabel("Compare expression groups", { exact: true })
    .selectOption("tpm");
  await page.getByLabel("Custom TPM cutoff").fill("10");
  await page.getByRole("button", { name: "Create survival plot" }).click();
  await expect(
    page.getByRole("img", { name: "ITGA2 TCGA-PAAD survival" }),
  ).toBeVisible();
  for (const name of ["SVG", "PDF", "PNG", "JSON"]) {
    await expect(page.getByRole("button", { name })).toBeEnabled();
  }
});

test("loads CPTAC alongside TCGA and exports source-aware figures using same-origin assets", async ({
  page,
}) => {
  const root = resolve("../tests/fixtures/cptac/2026.09.18");
  const cptac = JSON.parse(
    readFileSync(resolve(root, "manifest-2026.09.18.json"), "utf8"),
  );
  const tcga = JSON.parse(
    readFileSync(
      resolve("public/data/2026.07.28/manifest-2026.07.28.json"),
      "utf8",
    ),
  );
  // A synthetic combined catalog tests both immutable fixtures without changing either one.
  await page.route("**/data/2026.07.28/*", async (route) => {
    const filename = new URL(route.request().url()).pathname.split("/").at(-1)!;
    if (filename.startsWith("manifest-")) {
      await route.fulfill({
        json: {
          ...tcga,
          schema_version: 2,
          cohorts: { ...tcga.cohorts, ...cptac.cohorts },
          genes: [...tcga.genes, ...cptac.genes],
        },
      });
    } else if (filename.startsWith("CPTAC-")) {
      await route.fulfill({ path: resolve(root, filename) });
    } else {
      await route.continue();
    }
  });
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().startsWith("http") &&
      new URL(request.url()).hostname !== "127.0.0.1"
    ) {
      externalRequests.push(request.url());
    }
  });
  await page.goto("?gene=SRD5A1&cohort=CPTAC-3-PAAD&cutoff=median");
  await expect(
    page.getByRole("img", { name: "SRD5A1 CPTAC-3-PAAD survival" }),
  ).toBeVisible();
  await expect(
    page.getByText("Endpoint unavailable", { exact: true }),
  ).toHaveCount(3);
  await expect(page.getByText(/n=97 · events=76/)).toBeVisible();
  await expect(page.locator("optgroup[label='TCGA']")).toHaveCount(1);
  await expect(page.locator("optgroup[label='CPTAC']")).toHaveCount(1);
  await expect(page.locator('[data-element="statistics.OS"]')).toContainText(
    "p=",
  );
  await expect(
    page.locator('[data-element="statistics.OS"]'),
  ).not.toContainText("q=");
  await page.getByText("Survival details", { exact: true }).click();
  await expect(
    page.getByLabel("Show adjusted q-value", { exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "About p and q", exact: true })
    .hover();
  await expect(page.getByRole("tooltip")).toContainText(
    "One tested outcome: q equals p",
  );
  await page.mouse.move(0, 0);
  for (const kind of ["SVG", "JSON"]) {
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: kind, exact: true }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe(
      `SRD5A1_CPTAC_3_PAAD_KM_survival.${kind.toLowerCase()}`,
    );
    const text = readFileSync((await download.path())!, "utf8");
    expect(text).toContain("GDC CPTAC overall survival");
    expect(text).not.toContain("PanCanAtlas TCGA-CDR");
    if (kind === "SVG") {
      expect(text).toContain('width="6.8in"');
      expect(text).toContain('height="6.8in"');
      expect(text).not.toContain("q=");
    } else {
      const result = JSON.parse(text);
      expect(result.endpoints.OS.logrankQ).toBe(result.endpoints.OS.logrankP);
    }
  }
  await page.getByLabel("Cancer cohort").selectOption("PAAD");
  await page.getByRole("button", { name: "Create survival plot" }).click();
  await expect(
    page.getByRole("img", { name: "SRD5A1 TCGA-PAAD survival" }),
  ).toBeVisible();
  await expect(page.locator("svg.survival-plot")).not.toContainText("q=");
  const qToggle = page.getByLabel("Show adjusted q-value", { exact: true });
  await expect(qToggle).not.toBeChecked();
  await expect(qToggle).toBeEnabled();
  await page
    .getByRole("button", { name: "Cite this analysis", exact: true })
    .click();
  await expect(page.getByLabel("Methods and acknowledgement")).toHaveValue(
    /without multiple-testing adjustment/,
  );
  await page.getByRole("button", { name: "Close citations" }).click();
  await qToggle.check();
  await expect(page.locator('[data-element="statistics.OS"]')).toContainText(
    "p=0.0018 q=0.0069",
  );
  await page
    .getByRole("button", { name: "Cite this analysis", exact: true })
    .click();
  await expect(page.getByLabel("Methods and acknowledgement")).toHaveValue(
    /q-values.*across the 4 outcomes/,
  );
  await page.getByRole("button", { name: "Close citations" }).click();
  await page.getByText("Outcomes and layout", { exact: true }).click();
  for (const endpoint of ["DSS", "PFI", "DFI"])
    await page.getByLabel(endpoint, { exact: true }).uncheck();
  await expect(page.locator('[data-element="statistics.OS"]')).toContainText(
    "q=",
  );
  await page
    .getByRole("button", { name: "About p and q", exact: true })
    .hover();
  await expect(page.getByRole("tooltip")).toContainText("4 tested outcomes");
  await page.mouse.move(0, 0);
  const save = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = (await (await save).path())!;
  expect(JSON.parse(readFileSync(saved, "utf8")).settings.showQ).toBe(true);
  await page.getByRole("button", { name: "Reset figure", exact: true }).click();
  await expect(qToggle).not.toBeChecked();
  await expect(page.locator("svg.survival-plot")).not.toContainText("q=");
  const svgExport = page.waitForEvent("download");
  await page.getByRole("button", { name: "SVG", exact: true }).click();
  const svg = readFileSync((await (await svgExport).path())!, "utf8");
  expect(svg).toContain("p=0.0018");
  expect(svg).not.toContain("q=");
  await page.getByLabel("Open figure file").setInputFiles(saved);
  await expect(qToggle).toBeChecked();
  await expect(page.locator('[data-element="statistics.OS"]')).toContainText(
    "q=0.0069",
  );
  await qToggle.uncheck();
  await expect(page.locator("svg.survival-plot")).not.toContainText("q=");
  expect(externalRequests).toEqual([]);
});
