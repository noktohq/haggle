# Devpost submission — WebMCP Challenge

Copy-paste source for the Devpost form. Keep this file in sync with what is
actually submitted.

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

### What it does

Bikepoint is a real Shopify store with a real e-bike catalog. Its product pages
register five WebMCP tools (`list_negotiable_products`, `start_negotiation`,
`make_offer`, `get_negotiation_state`, `accept_deal`). Your agent opens a
negotiation with the store's server-side AI seller, trades offers in NOK over up
to six rounds, and when you accept, the server mints a **real single-use Shopify
discount code** scoped to that product, valid 48 hours. The human redeems it in
the normal checkout.

Because Shopify's own storefront WebMCP tools (`update_cart`,
`proceed_to_checkout`, …) live on the same page, the full loop is agentic:
negotiate the price with our tools, add to cart and check out with Shopify's.

A small on-page widget shows the human what their agent is doing in real time —
offers, counteroffers, and the final code.

### How we built it

- **Server:** zero-dependency Node 20 negotiation service on Cloud Run. The
  price floor (max discount %) exists only inside a deterministic engine —
  never in a prompt, never on the client. JSDoc-typed under `tsc --checkJs`
  strict; unit tests hammer the floor (never breached, never leaked).
- **Seller voice:** Claude phrases the seller's replies (charming Norwegian bike
  dealer). It can only *phrase* — every number is computed and clamped by the
  engine first, and any reply that doesn't quote the authoritative price is
  discarded. With no API key, deterministic Norwegian templates take over.
- **Storefront:** one `<script>` line in the Shopify theme loads
  `webmcp-haggle.js`, which registers the tools on `document.modelContext`
  (with the `navigator.modelContext` fallback) and talks to the server.
- **Deals are real:** `discountCodeBasicCreate` via the Shopify Admin API —
  single-use, product-scoped, 48-hour expiry.
- **Tested like an agent:** a Playwright suite shims `document.modelContext`
  the way an agent runtime would, captures the registered tools and plays the
  buyer through full negotiations — in CI on every push, and against the live
  store.

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

Per-customer pricing strategies, inventory-aware floors, bundle haggling
("throw in a helmet"), and a merchant dashboard with negotiation analytics.
And of course: turning it on for a store that isn't behind a dev-store
password.

## Built with

`javascript` `node.js` `webmcp` `shopify` `claude` `google-cloud-run`
`playwright` `github-actions`

## Try it out — links

- Live store (dev store): <https://bikepoint-no.myshopify.com> — password: `haggle`
- Source: <https://github.com/noktohq/haggle>
- API (Cloud Run): <https://haggle-463490695016.europe-north1.run.app>

## Testing instructions for judges

**On the live store (agent):**

1. Open <https://bikepoint-no.myshopify.com> in ChatGPT's browser, or in Chrome
   with `chrome://flags/#enable-webmcp-testing` enabled. Store password:
   `haggle`.
2. Go to any product page (e.g. `/products/scultura-endurance-300`).
3. Ask your agent to negotiate the price. It will discover the tools and haggle
   with the AI seller; the widget bottom-right shows the negotiation live.
4. Accept a deal → you get a real single-use discount code; add the bike to the
   cart and apply it at checkout to see the negotiated price.

**Without any accounts (reproducible):**

```bash
git clone https://github.com/noktohq/haggle && cd haggle/server
npm test                          # engine test suite (price floor, rounds, leaks)
MOCK_PRODUCTS=1 node src/index.js # fixture catalog on :8080
bash ../scripts/smoke.sh          # black-box negotiation over HTTP
cd ../e2e && npm ci && npx playwright test   # plays the buyer's agent in Chromium
```

Or serve `storefront/demo.html` over HTTPS and open it with the WebMCP flag for
the browser loop without Shopify.

## Video

(YouTube link — added at submission time. Under 3 minutes, shows the live
store, a full negotiation by an agent, and the discount code applied at
checkout. Unlisted is fine — Devpost only needs the link to resolve.)
