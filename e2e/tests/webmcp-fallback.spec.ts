/**
 * The pre-Chromium-150 registration surface: webmcp-haggle.js must fall back to
 * `navigator.modelContext` when `document.modelContext` does not exist. Same
 * shim technique as webmcp.spec.ts, installed on the navigator instead.
 */
import { test, expect } from '@playwright/test';
import { API_PORT } from '../playwright.config';

const EXPECTED_TOOLS = [
  'accept_deal',
  'get_negotiation_state',
  'list_negotiable_products',
  'make_offer',
  'start_negotiation',
];

test('registers all five tools via the navigator.modelContext fallback', async ({ page }) => {
  await page.addInitScript(() => {
    const tools = new Map();
    (window as any).__mcpTools = tools;
    // Only the legacy surface exists — document.modelContext stays undefined.
    (navigator as any).modelContext = {
      registerTool(def: unknown) {
        tools.set((def as { name: string }).name, def);
        return Promise.resolve();
      },
    };
  });
  await page.goto(`/demo.html?api=${encodeURIComponent(`http://127.0.0.1:${API_PORT}`)}`);
  await page.waitForFunction((n) => (window as any).__mcpTools?.size >= n, EXPECTED_TOOLS.length);

  const names = await page.evaluate(() => [...(window as any).__mcpTools.keys()].sort());
  expect(names).toEqual(EXPECTED_TOOLS);

  // The fallback-registered tools are live, not just listed: one real call works.
  const listed = await page.evaluate(async () => {
    const tool = (window as any).__mcpTools.get('list_negotiable_products');
    const result = await tool.execute({});
    return JSON.parse(result.content[0].text);
  });
  expect(listed.products.length).toBeGreaterThan(0);
  expect(listed.products[0]).toHaveProperty('priceNOK');
});
