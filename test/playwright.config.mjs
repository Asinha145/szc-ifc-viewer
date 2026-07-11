import { defineConfig } from "@playwright/test";

// Runs against the system-installed Microsoft Edge (channel: "msedge") so no
// browser download is needed. The static server is started automatically.
export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    channel: "msedge",
    headless: true,
    viewport: { width: 1400, height: 900 },
    // allow software WebGL when no GPU is available in headless mode
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
  },
  webServer: {
    command: "node serve.mjs 8177",
    url: "http://localhost:8177",
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
