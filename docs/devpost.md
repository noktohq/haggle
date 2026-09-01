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
ends. WebMCP removes exactly that constraint: a storefront can now expose a
*negotiation protocol* as tools, and the browser's agent represents the buyer
while the human keeps the final say. We wanted to build the first store where
"can you do better on the price?" is something your agent just… does.

The timing matters, too. Agentic commerce is arriving — ChatGPT's browser,
Chrome's WebMCP work — and when agents do the shopping, merchants get squeezed
into pure price comparison. A sanctioned negotiation channel with a hard,
merchant-set ceiling is the merchant's controlled answer to that squeeze.

### What it does

Bikepoint is a real Shopify store with a real e-bike catalog. One script line
in the theme registers five WebMCP tools (`list_negotiable_products`,
`start_negotiation`, `make_offer`, `get_negotiation_state`, `accept_deal`) on
every page of the store — on a product page they default to that product, and
from anywhere else the agent can list the catalog and pick. Your agent opens a
negotiation with the store's server-side AI seller, trades offers in NOK over
up to six rounds, and when you accept, the server mints a **real single-use
Shopify discount code** scoped to that product, valid 48 hours. The human
redeems it in the normal checkout — and because the code is single-use,
product-scoped and short-lived, it can't leak to coupon sites the way ordinary
discount codes do. Only one buyer can ever redeem it.

The seller cannot be talked below its secret floor — not because a prompt says
so, but because the floor never leaves a deterministic engine. **Try to
jailbreak it: the seller can't be social-engineered below the floor, because
the seller never knows anything the engine didn't already decide.**

Because Shopify's own storefront WebMCP tools (`update_cart`,
`proceed_to_checkout`, …) are live on the same pages — Shopify's own
`webmcp_adapter` is present and feature-detects the very same
`document.modelContext` surface, which we verified on the live store — the full
loop is agentic: negotiate the price with our tools, add to cart and check out
with Shopify's. Zero coordination between the two.

A small on-page widget shows the human what their agent is doing in real time —
offers, counteroffers, and the final code. To human visitors the store
deliberately looks like a completely normal bike shop: the negotiation surface
is visible only to agents.

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
  keeps its integrity; only buyers who bother to negotiate get below it, and
  never below the merchant's hard ceiling (`MAX_DISCOUNT_PCT`, 10 % here).
- **"Everyone just gets 10 % — it's a hidden sale"? No.** The engine's
  round-and-concession curve closes lazy bids well above the floor, and even a
  perfectly played negotiation bottoms out at the seller's final offer — a step
  above the floor, which itself is never crossed. The ceiling is per-store, and
  per-product floors are on the roadmap.
- **The deal can't leak.** The code is single-use, product-scoped and expires
  in 48 hours (verifiable in the source: `discountCodeBasicCreate`) — unlike a
  regular discount code it's worthless on Honey or coupon sites.
- **Who this is for:** high-ticket Shopify categories with real margins and a
  haggling culture — bikes, furniture, jewelry, appliances, refurbished
  electronics. Installation is one script line on any Online Store 2.0 theme,
  invisible to non-agent visitors.
- **Prior art is one-way or human-gated:** eBay's Best Offer and "make an
  offer" apps are marketplace-bound or wait on a human; coupon plugins are
  static. Haggle is an instant, two-way, real-time protocol between two AIs on
  the merchant's own store.

### How we built it

- **Server:** zero-dependency Node 20 negotiation service on Cloud Run. The
  price floor (max discount %) exists only inside a deterministic engine —
  never in a prompt, never on the client. JSDoc-typed under `tsc --checkJs`
  strict; unit tests hammer the floor (never breached, never leaked).
- **Seller voice — pluggable, never in charge:** with an Anthropic key, Claude
  phrases the seller's replies (a charming Norwegian bike dealer); without
  one, a deterministic Norwegian template voice speaks. Either way the voice
  only *phrases* — every number is computed and clamped by the engine first,
  and any reply that doesn't quote the authoritative price is discarded.
- **Storefront:** one `<script>` line in the Shopify theme loads
  `webmcp-haggle.js`, which registers the tools on `document.modelContext`
  (with the `navigator.modelContext` fallback) and talks to the server.
- **Deals are real:** `discountCodeBasicCreate` via the Shopify Admin API —
  single-use, product-scoped, 48-hour expiry.
- **Tested like an agent:** a Playwright suite shims `document.modelContext`
  (and, in a separate spec, the `navigator.modelContext` fallback) the way an
  agent runtime would, captures the registered tools and plays the buyer
  through full negotiations — in CI on every push to main and on every PR. The
  live store loads this same storefront source file, pinned by commit on a CDN.

### Challenges we ran into

- Keeping the secret price floor *structurally* unleakable while still letting
  an LLM speak for the seller (solution: the LLM only phrases; guards discard
  off-script numbers).
- WebMCP is brand new — building against the spec plus Chrome's
  `enable-webmcp-testing` flag and ChatGPT's in-app browser, with a
  `navigator.modelContext` fallback for older builds.
- Real-store plumbing: Shopify custom-app tokens, scopes, and a theme with a
  broken product template that had to be diagnosed and fixed before the demo
  could run on genuine product pages.

### Accomplishments that we're proud of

- A complete, live agent-to-agent commerce loop on a real store: negotiate →
  deal → real discount code → normal checkout.
- Safety by structure, not by prompt: the floor cannot be jailbroken out of the
  seller because the seller never knows anything the engine didn't decide.
- The whole negotiation surface is reproducible without any accounts:
  `MOCK_PRODUCTS=1` fixture mode, a standalone `demo.html`, a smoke script and
  an e2e suite that anyone (including judges) can run.

### What we learned

Tools beat chat for commerce: exposing a *protocol* (offers, rounds, state,
acceptance) gives agents something they can be genuinely good at, while the
human keeps the decisions that matter. And WebMCP's page-level tool
registration composes beautifully — our negotiation tools sat next to
Shopify's native cart tools with zero coordination.

### What's next for Haggle

Dynamic tool lifecycle (registering `make_offer`/`accept_deal` only while a
negotiation is open, via WebMCP's AbortSignal unregistration), per-product and
inventory-aware floors via metafields, per-customer pricing strategies, bundle
haggling ("throw in a helmet"), and a merchant dashboard with negotiation
analytics. And of course: turning it on for a store that isn't behind a
dev-store password.

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
