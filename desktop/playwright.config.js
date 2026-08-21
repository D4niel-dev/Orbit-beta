// Playwright E2E config for the Orbit Electron desktop app.
// The app's own Electron binary is the "browser" — no `npx playwright install` needed.
// TCP port 46000 is single-listener, so tests must never run in parallel: workers: 1.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 60000,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
});
