import { expect, test } from "@playwright/test";

test("renders the reference plot without external runtime requests", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") externalRequests.push(request.url());
  });
  await page.goto("?gene=SRD5A1&cohort=PAAD&cutoff=median");
  await expect(
    page.getByRole("link", { name: "SurvScope", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Choose an analysis" }),
  ).toBeVisible();
  await expect(page.getByText("Transparent by design")).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "SRD5A1 TCGA-PAAD survival" }),
  ).toBeVisible();
  await expect(page.getByText("recommended", { exact: true })).toHaveCount(4);
  await expect(page.getByText(/n=177; events=93/)).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test("supports custom cutoffs and all figure download controls", async ({
  page,
}) => {
  await page.goto("?gene=ITGA2&cohort=PAAD&cutoff=median");
  await expect(
    page.getByRole("img", { name: "ITGA2 TCGA-PAAD survival" }),
  ).toBeVisible();
  await page.getByText("Custom TPM", { exact: true }).click();
  await page.getByLabel("Custom TPM cutoff").fill("10");
  await page.getByRole("button", { name: "Create survival plot" }).click();
  await expect(
    page.getByRole("img", { name: "ITGA2 TCGA-PAAD survival" }),
  ).toBeVisible();
  for (const name of ["SVG", "PDF", "PNG", "JSON"]) {
    await expect(page.getByRole("button", { name })).toBeEnabled();
  }
});
