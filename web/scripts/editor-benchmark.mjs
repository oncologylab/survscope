// Run against a production build serving the complete, same-origin data catalog.
// Usage: node web/scripts/editor-benchmark.mjs http://127.0.0.1:4174/survscope/ data-build/editor-performance.json
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
const url = process.argv[2] ?? "http://127.0.0.1:4174/survscope/";
const output = process.argv[3] ?? "data-build/editor-performance.json";
const browser = await chromium.launch({
  channel: process.env.CI ? undefined : "chrome",
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 3840, height: 2160 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`${url}?gene=TP53&cohort=BRCA`);
  await page.locator("svg.survival-plot").waitFor();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const project = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  if (project.analysis.gene !== "TP53" || project.analysis.cohort !== "BRCA")
    throw Error("Benchmark requires TP53/BRCA production data.");
  Object.assign(project.settings, {
    confidence: true,
    censors: true,
    riskTable: true,
  });
  project.settings.annotations = Array.from({ length: 100 }, (_, i) => ({
    id: `benchmark-${i}`,
    kind: "text",
    text: `Note ${i + 1}`,
    x: 0.1 + (i % 20) * 0.04,
    y: 0.08 + Math.floor(i / 20) * 0.15,
    x2: 0.2,
    y2: 0.2,
    fontSize: 8,
    color: "#123456",
    lineWidth: 1,
  }));
  await page
    .getByLabel("Open figure file")
    .setInputFiles({
      name: "benchmark.survscope.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await page.locator('[data-element="annotation.benchmark-99"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const cdp = await context.newCDPSession(page);
  const results = [];
  for (const rate of [1, 4]) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    const runs = [];
    for (let run = -1; run < 3; run++) {
      const box = await page.locator('[data-element="title"]').boundingBox();
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.evaluate(() => {
        window.bench = { frames: [], longTasks: [], active: true, last: null };
        const b = window.bench;
        b.observer = new PerformanceObserver((list) =>
          b.longTasks.push(...list.getEntries().map((e) => e.duration)),
        );
        b.observer.observe({ type: "longtask", buffered: false });
        const frame = (t) => {
          if (b.last !== null) b.frames.push(t - b.last);
          b.last = t;
          if (b.active) b.raf = requestAnimationFrame(frame);
        };
        b.raf = requestAnimationFrame(frame);
      });
      await page.mouse.down();
      for (let i = 1; i <= 120; i++)
        await page.mouse.move(x + (180 * i) / 120, y + (60 * i) / 120);
      await page.mouse.up();
      // Two paint opportunities include the final document commit.
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const result = await page.evaluate(() => {
        const b = window.bench;
        b.active = false;
        cancelAnimationFrame(b.raf);
        b.longTasks.push(...b.observer.takeRecords().map((e) => e.duration));
        b.observer.disconnect();
        b.frames.sort((a, b) => a - b);
        return {
          frames: b.frames.length,
          p95FrameMs: b.frames[Math.ceil(b.frames.length * 0.95) - 1],
          maxFrameMs: Math.max(...b.frames),
          longTasks: b.longTasks.length,
          maxLongTaskMs: Math.max(0, ...b.longTasks),
        };
      });
      if (run >= 0) runs.push(result);
      await page.getByRole("button", { name: "Undo", exact: true }).click();
    }
    const medianP95 = runs.map((r) => r.p95FrameMs).sort((a, b) => a - b)[1];
    results.push({
      cpuSlowdown: rate,
      runs,
      medianP95FrameMs: medianP95,
      pass:
        medianP95 <= (rate === 1 ? 20 : 33) &&
        runs.every((r) => r.maxLongTaskMs <= 100),
    });
  }
  const report = {
    timestamp: new Date().toISOString(),
    browser: await browser.version(),
    platform: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0].model,
    cores: os.cpus().length,
    viewport: { width: 3840, height: 2160, deviceScaleFactor: 1 },
    workload: {
      gene: "TP53",
      cohort: "BRCA",
      dataVersion: project.analysis.dataVersion,
      annotations: 100,
      overlays: ["confidence", "censors", "riskTable"],
      svgNodes: await page.locator("svg.survival-plot *").count(),
      dragSteps: 120,
      warmupRuns: 1,
    },
    results,
  };
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (results.some((r) => !r.pass)) process.exitCode = 1;
} finally {
  await browser.close();
}
