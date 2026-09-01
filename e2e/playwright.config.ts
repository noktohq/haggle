import { defineConfig, devices } from '@playwright/test';

/**
 * E2E setup: two local processes, both started by Playwright.
 *  - the Haggle negotiation server in mock mode (fixture catalog, fake codes)
 *  - a tiny zero-dependency static server for storefront/ (demo.html + script)
 * The tests then exercise the real webmcp-haggle.js through a WebMCP shim —
 * see tests/webmcp.spec.ts.
 */
export const API_PORT = 8791;
export const WEB_PORT = 8790;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ../server/src/index.js',
      url: `http://127.0.0.1:${API_PORT}/healthz`,
      env: { MOCK_PRODUCTS: '1', PORT: String(API_PORT), ALLOWED_ORIGINS: '*' },
      reuseExistingServer: false,
    },
    {
      command: 'node scripts/static-server.mjs',
      url: `http://127.0.0.1:${WEB_PORT}/demo.html`,
      env: { PORT: String(WEB_PORT) },
      reuseExistingServer: false,
    },
  ],
});
