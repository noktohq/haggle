# Devpost submission — WebMCP Challenge

Copy-paste source for the Devpost form. Keep this file in sync with what is
actually submitted. **Oppdatert 2026-09-01 — må limes inn i Devpost-skjemaet
før fristen 3. september kl. 22:00 norsk tid (13:00 PDT); skjemaet låses da.**

## Project name

Haggle

## Elevator pitch (tagline)

The first bike store where your AI haggles the price with our AI — and the deal
becomes a real discount code at a real Shopify checkout.

## About the project

### Inspiration

Price negotiation died when commerce moved online — it needed a human on both
ends. WebMCP removes exactly that constraint: the storefront exposes a
*negotiation protocol* as tools, the browser's agent represents the buyer, and
the human keeps the final say. We wanted to build the first store where "can
you do better on the price?" is something your agent just… does — and the
timing is right: when agents do the shopping, merchants get squeezed into pure
price comparison, and a sanctioned negotiation channel with a hard ceiling is
their controlled answer.

### What it does

**Your agent → negotiation → real deal → real Shopify discount code →
checkout.** That is the whole loop, and it runs live today on Bikepoint, a
Shopify store with a real e-bike catalog.

**Claude speaks. The engine decides every price. The floor cannot be
negotiated away** — the seller never knows anything the engine didn't decide,
so there is nothing to jailbreak. Try it.

One script line in the theme registers five WebMCP tools
(`list_negotiable_products`, `start_negotiation`, `make_offer`,
`get_negotiation_state`, `accept_deal`) on every page of the store; on a
product page they default to that product. The agent trades offers in NOK with
the server-side AI seller over up to six rounds. Accept, and the server mints
a single-use discount code scoped to that product, valid 48 hours — worthless
to coupon sites, redeemed in the normal checkout.

Shopify's own storefront WebMCP tools (`update_cart`, `proceed_to_checkout`,
…) are live on the same pages — Shopify's `webmcp_adapter` feature-detects the
very same `document.modelContext` surface, verified on the live store. So the
full journey is agentic with zero coordination: negotiate with our tools, cart
and check out with Shopify's. A small widget shows the human the negotiation
in real time; to everyone else the store looks like a completely normal bike
shop.

An actual negotiation from the live store, verbatim:

> **Buyer's agent:** offers 12 000 kr for the Scultura Endurance 300 (listed 18 999 kr)
> **Seller:** «Nesten! Denne går sjelden under 18350 kr — men da er den din.»
> **Buyer's agent:** counters at 17 500 kr
> **Seller:** «Da har vi en avtale! 17500 kr for Scultura Endurance 300 — godt
> forhandlet. Bruk rabattkoden i kassen.» → a real `HAGGLE-…` code, applied at
> checkout at the negotiated price.

### Why would a merchant ever allow haggling?

Because negotiation is controlled price discrimination — the oldest trick in
retail, finally automatable:

- **Capture price-sensitive buyers without a storewide sale.** The list price
  keeps its integrity; only buyers who negotiate get below it, and never below
  the merchant's ceiling (`MAX_DISCOUNT_PCT`, 10 % here).
- **"Everyone just gets 10 %"? No.** Lazy bids close well above the floor, and
  even a perfectly played negotiation bottoms out at the seller's final offer —
  a step above a floor that is never crossed.
- **The deal can't leak.** Single-use, product-scoped, 48-hour expiry
  (`discountCodeBasicCreate`). Only one buyer can ever redeem it.
- **Who it's for:** high-ticket Shopify categories with real margins and a
  haggling culture — bikes, furniture, jewelry, appliances, refurbished
  electronics. Installation is one script line on any Online Store 2.0 theme,
  invisible to non-agent visitors.
- **Prior art is one-way or human-gated:** eBay's Best Offer waits on a human,
  coupon plugins are static. Haggle is an instant, two-way protocol between
  two AIs on the merchant's own store.

### How we built it

- **Server:** a zero-dependency Node 20 service on Cloud Run. The price floor
  exists only inside a deterministic engine — never in a prompt, never on the
  client — and the tests hammer it: never breached, never leaked.
- **Seller's voice, never in charge:** Claude phrases the replies (a charming
  Norwegian bike dealer) when a key is set; a deterministic Norwegian template
  voice otherwise. Either way the voice only *phrases* — any reply that
  doesn't quote the engine's price is discarded.
- **Storefront:** one `<script>` line in the theme registers the tools on
  `document.modelContext` (with the `navigator.modelContext` fallback) and
  talks to the server.
- **Tested like an agent:** a Playwright suite shims the WebMCP runtime,
  captures the registered tools and plays the buyer through full negotiations —
  in CI on every push to main and on every PR. The live store loads this same
  storefront source file, pinned by commit on a CDN.

### Challenges we ran into

- Letting an LLM speak for the seller without ever letting it touch a number.
- WebMCP is brand new — built against the spec, Chrome's
  `enable-webmcp-testing` flag and ChatGPT's in-app browser, with a
  `navigator.modelContext` fallback for older builds.
- Real-store plumbing: custom-app tokens, scopes, and a theme with a broken
  product template to diagnose before the demo could run on genuine product
  pages.

### Accomplishments that we're proud of

- The loop at the top is not a mock-up — it runs on a real store, and anyone
  can verify it.
- The whole negotiation surface is reproducible without accounts:
  `MOCK_PRODUCTS=1` fixture mode, a standalone `demo.html`, a smoke script and
  an e2e suite judges can run.

### What we learned

Tools beat chat for commerce: a *protocol* (offers, rounds, state, acceptance)
gives agents something they can be genuinely good at, while the human keeps
the decisions that matter. And WebMCP's page-level registration composes
beautifully — our negotiation tools sat next to Shopify's native cart tools
with zero coordination.

### What's next for Haggle

Dynamic tool lifecycle (registering `make_offer`/`accept_deal` only while a
negotiation is open, via AbortSignal unregistration), per-product and
inventory-aware floors via metafields, bundle haggling ("throw in a helmet"),
a merchant dashboard with negotiation analytics — and turning it on for a
store that isn't behind a dev-store password.

## Built with

`javascript` `node.js` `webmcp` `shopify` `claude` `google-cloud-run`
`playwright` `github-actions`

## Try it out — links

- Live store (dev store): <https://bikepoint-no.myshopify.com> — password: `haggle`
- Source: <https://github.com/noktohq/haggle>
- API (Cloud Run): <https://haggle-463490695016.europe-north1.run.app>

## Testing instructions for judges

**On the live store — the full agent loop:**

1. **Best path: ChatGPT's browser.** Open
   <https://bikepoint-no.myshopify.com> (store password: `haggle`) in ChatGPT's
   in-app browser and go to any product page, e.g.
   `/products/scultura-endurance-300`.
2. Ask the agent, for example: *"This store lets you negotiate the price —
   use its tools to get me a better deal on this bike."* It will discover the
   five tools and haggle with the AI seller; the widget bottom-right shows the
   negotiation live. Try to push the seller below its floor — it won't go.
3. Accept a deal → you get a real single-use discount code; add the bike to
   the cart and apply the code at checkout to see the negotiated price.
4. **Chrome path (API surface only):** `chrome://flags/#enable-webmcp-testing`
   exposes WebMCP so the tools register (the console logs
   `[haggle] WebMCP tools registered`), but stock Chrome ships no agent that
   *drives* the tools — pair the flag with a WebMCP-driving agent or
   extension, or use ChatGPT's browser for the full loop.

**Without any accounts (reproducible):**

```bash
git clone https://github.com/noktohq/haggle && cd haggle/server
npm test                          # engine test suite (price floor, rounds, leaks)
MOCK_PRODUCTS=1 node src/index.js # fixture catalog on :8080
bash ../scripts/smoke.sh          # black-box negotiation over HTTP
cd ../e2e && npm ci && npx playwright test   # plays the buyer's agent in Chromium
```

Or serve `storefront/` statically (e.g. `npx http-server storefront`) and open
`demo.html` in a WebMCP-enabled browser with the `MOCK_PRODUCTS=1` server
from the block above running — the server accepts localhost origins out of the
box, and
`?api=<url>` points the page at any other server. Note: `GET /healthz` on the
hosted `*.run.app` URL is intercepted by Google's frontend (HTML 404); probe
`POST /api/session` instead — locally, `/healthz` works as documented.

## Video

<https://youtu.be/yQ7mweGOoYQ> — 1:55, public. Shows the live store, a full
agent negotiation, and the discount code applied in the cart at the
negotiated price.
