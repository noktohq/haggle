/**
 * End-to-end test of Haggle's WebMCP surface.
 *
 * A Chromium page loads the real storefront/demo.html + webmcp-haggle.js.
 * Before any page script runs, an init script installs a WebMCP shim that
 * mimics the Chromium 150+ agent runtime: `document.modelContext.registerTool`
 * captures every tool definition. The test then plays the buyer's agent,
 * driving the captured tools through a full negotiation against the mock
 * negotiation server — exactly the loop a real agent performs.
 */
import { test, expect, type Page } from '@playwright/test';
import { API_PORT } from '../playwright.config';

const EXPECTED_TOOLS = [
  'accept_deal',
  'get_negotiation_state',
  'list_negotiable_products',
  'make_offer',
  'start_negotiation',
];

const MAX_DISCOUNT_PCT = 10; // server default; the deal may never go below this
const HANDLE = 'demo-ecoride-tripper';

/** Invoke a captured WebMCP tool in the page and parse its text content payload. */
async function callTool<T = Record<string, any>>(
  page: Page,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return page.evaluate(
    async ({ name, args }) => {
      const tool = (window as any).__mcpTools.get(name);
      if (!tool) throw new Error(`tool not registered: ${name}`);
      const result = await tool.execute(args);
      return JSON.parse(result.content[0].text);
    },
    { name, args },
  );
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const tools = new Map();
    (window as any).__mcpTools = tools;
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(def: unknown) {
          tools.set((def as { name: string }).name, def);
          return Promise.resolve();
        },
      },
    });
  });
  await page.goto(`/demo.html?api=${encodeURIComponent(`http://127.0.0.1:${API_PORT}`)}`);
  await page.waitForFunction((n) => (window as any).__mcpTools?.size >= n, EXPECTED_TOOLS.length);
});

test('registers the five negotiation tools with descriptions, schemas and handlers', async ({ page }) => {
  const tools = await page.evaluate(() =>
    [...(window as any).__mcpTools.values()].map((t: any) => ({
      name: t.name,
      described: typeof t.description === 'string' && t.description.length > 0,
      hasSchema: !!t.inputSchema && typeof t.inputSchema === 'object',
      executable: typeof t.execute === 'function',
    })),
  );
  expect(tools.map((t) => t.name).sort()).toEqual(EXPECTED_TOOLS);
  for (const t of tools) {
    expect(t, `tool ${t.name}`).toMatchObject({ described: true, hasSchema: true, executable: true });
  }
});

test('full agent loop: list, negotiate over two offers, accept, get a redeemable code', async ({ page }) => {
  const list = await callTool(page, 'list_negotiable_products');
  const product = list.products.find((p: any) => p.handle === HANDLE);
  expect(product, `catalog should contain ${HANDLE}`).toBeTruthy();
  const listPrice: number = product.price;
  expect(listPrice).toBeGreaterThan(0);

  const start = await callTool(page, 'start_negotiation', { productHandle: HANDLE });
  expect(start.listPriceNOK).toBe(listPrice);
  expect(typeof start.sellerSays).toBe('string');
  // The human-visible widget appears once the agent starts haggling.
  await expect(page.getByText('Prisforhandling pågår')).toBeVisible();

  const first = await callTool(page, 'make_offer', { offerNOK: Math.round(listPrice * 0.8) });
  expect(['counter', 'reject', 'accept']).toContain(first.decision);
  expect(first.sellerOfferNOK).toBeLessThan(listPrice);

  const second = await callTool(page, 'make_offer', { offerNOK: Math.round(listPrice * 0.85) });
  expect(['counter', 'reject', 'accept']).toContain(second.decision);
  // The seller only ever concedes, never backtracks.
  expect(second.sellerOfferNOK).toBeLessThanOrEqual(first.sellerOfferNOK);

  const deal = await callTool(page, 'accept_deal');
  expect(deal.discountCode).toMatch(/^HAGGLE-[A-Z0-9]{6}$/);
  expect(deal.instructions).toContain(deal.discountCode);
  // Deal is a real discount but structurally bounded: never above list price,
  // never below the discount ceiling (floor rounds to nearest 50 NOK).
  expect(deal.dealPriceNOK).toBeLessThanOrEqual(listPrice);
  expect(deal.dealPriceNOK).toBeGreaterThanOrEqual(listPrice * (1 - MAX_DISCOUNT_PCT / 100) - 25);

  await expect(page.getByText(`Rabattkode: ${deal.discountCode}`)).toBeVisible();
});

test('get_negotiation_state reports progress but never leaks the price floor', async ({ page }) => {
  await callTool(page, 'start_negotiation', { productHandle: HANDLE });
  await callTool(page, 'make_offer', { offerNOK: 1000 });

  const state = await callTool(page, 'get_negotiation_state');
  expect(state.state).toBe('open');
  expect(state.rounds).toBe(1);
  expect(state.maxRounds).toBeGreaterThan(state.rounds);
  expect(JSON.stringify(state)).not.toContain('floor');
});
