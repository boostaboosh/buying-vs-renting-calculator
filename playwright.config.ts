import { defineConfig, devices } from "@playwright/test";

// UI tests: behaviour checks plus screenshot comparisons against committed
// reference images in e2e/__screenshots__. See README "UI tests".
export default defineConfig({
  testDir: "e2e",
  snapshotPathTemplate: "e2e/__screenshots__/{testFilePath}/{arg}{ext}",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  expect: {
    // Near-exact on purpose: ratio-based allowances let a recoloured chart line and a
    // clipped label pass. Rendering is deterministic on one machine; CI skips pixel
    // comparisons (see the workflow).
    toHaveScreenshot: { maxDiffPixels: 10, animations: "disabled" },
  },
  use: {
    baseURL: "http://localhost:4173",
    // Uses a preinstalled Chromium if PLAYWRIGHT_BROWSERS_PATH points at one.
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npx vite build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
