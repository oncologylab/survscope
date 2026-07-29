import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173/survscope/",
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 1100 },
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/survscope/",
    reuseExistingServer: !process.env.CI,
  },
});
