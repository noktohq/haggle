/**
 * Haggle — WebMCP price negotiation for Shopify storefronts.
 *
 * Registers tools on document.modelContext (falling back to the pre-Chromium-150
 * navigator.modelContext) so an agent in ChatGPT's browser, or Chrome with
 * chrome://flags/#enable-webmcp-testing, can negotiate a price with the store's
 * server-side AI seller. Invisible to regular visitors apart from a small
 * progress widget that appears once a negotiation starts, so the human can
 * follow what their agent is doing.
 *
 * Configure the API base with:
 *   <script src=".../webmcp-haggle.js" data-api-url="https://your-haggle-api"></script>
 * or window.HAGGLE_API_URL before this script loads.
 */
(() => {
  'use strict';

  const mc = document.modelContext || navigator.modelContext;
  if (!mc || typeof mc.registerTool !== 'function') return; // no agent runtime — do nothing

  const script = document.currentScript;
  const API = (window.HAGGLE_API_URL || script?.dataset.apiUrl || '').replace(/\/$/, '');
  if (!API) return console.warn('[haggle] no API url configured');

  let sessionId = sessionStorage.getItem('haggle:session') || null;

  /* ---------- helpers ---------- */

  const asResult = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] });
  const asError = (msg) => asResult({ error: msg });

  async function api(path, body) {
    const res = await fetch(API + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = Object.assign(new Error(json.error || `API ${res.status}`), { code: json.code });
      throw err;
    }
    return json;
  }

  function currentHandle() {
    const m = location.pathname.match(/\/products\/([a-z0-9-]+)/);
    return m ? m[1] : null;
  }

  // The server keeps sessions in memory; a restart or instance swap loses them.
  // Drop the stale id and tell the agent how to recover instead of dead-ending.
  function lostSession(e) {
    if (e && (e.code === 'UNKNOWN_SESSION' || e.message === 'unknown session')) {
      sessionStorage.removeItem('haggle:session');
      sessionId = null;
      return asError('session lost (the server restarted) — call start_negotiation again to reopen');
    }
    return null;
  }

  /* ---------- tiny on-page widget so the human sees the haggling ---------- */

  let widget;
  function showWidget(html) {
    if (!widget) {
      widget = document.createElement('div');
      widget.setAttribute('style',
        'position:fixed;bottom:16px;right:16px;z-index:99999;max-width:320px;' +
        'background:#111;color:#f4f4f4;border:1px solid #333;border-radius:12px;' +
        'padding:14px 16px;font:13px/1.5 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.4)');
      document.body.appendChild(widget);
    }
    widget.innerHTML = html;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function renderState(title, line, extra) {
    showWidget(
      `<div style="font-weight:600;margin-bottom:4px">🤝 Prisforhandling pågår</div>` +
      `<div>${esc(title)}</div><div style="color:#9ae6b4;margin-top:4px">${esc(line)}</div>` +
      (extra ? `<div style="margin-top:6px;color:#ccc">${esc(extra)}</div>` : '')
    );
  }

  /* ---------- WebMCP tools ---------- */

  const NOK = (n) => `${Number(n).toLocaleString('no-NO')} kr`;

  mc.registerTool({
    name: 'list_negotiable_products',
    description:
      'List products in this bike store that are open for price negotiation. Returns title, handle (use with the other tools), and listed price in NOK.',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      try {
        const res = await fetch('/products.json?limit=20');
        if (res.ok) {
          const data = await res.json();
          return asResult({
            products: data.products.map((p) => ({
              title: p.title,
              handle: p.handle,
              priceNOK: Number(p.variants?.[0]?.price) || null,
              url: location.origin + '/products/' + p.handle,
            })),
          });
        }
        // Not on a Shopify origin (e.g. the standalone demo page) — ask the API.
        const alt = await api('/api/products');
        return asResult({
          products: (alt.products || []).map((p) => ({
            title: p.title,
            handle: p.handle,
            priceNOK: Number(p.priceNOK ?? p.price) || null,
          })),
        });
      } catch (e) {
        return asError('could not list products: ' + e.message);
      }
    },
  });

  mc.registerTool({
    name: 'start_negotiation',
    description:
      'Open a price negotiation with the store’s AI seller for a product. Input the product handle (from list_negotiable_products, or omit on a product page to use the current product). Returns the seller’s opening message and the listed price. Then use make_offer.',
    inputSchema: {
      type: 'object',
      properties: { productHandle: { type: 'string', description: 'Product handle, e.g. "demo-ecoride-tripper"' } },
    },
    async execute({ productHandle } = {}) {
      const handle = productHandle || currentHandle();
      if (!handle) return asError('no product handle given and not on a product page');
      try {
        const s = await api('/api/session', { productHandle: handle });
        sessionId = s.sessionId;
        sessionStorage.setItem('haggle:session', sessionId);
        renderState(s.product.title, `Utropspris: ${NOK(s.product.listPrice)}`, 'Agenten din forhandler…');
        return asResult({
          sellerSays: s.message,
          product: s.product,
          listPriceNOK: s.product.listPrice,
          hint: 'Make an offer in NOK with make_offer. The seller has a secret limit — negotiate!',
        });
      } catch (e) {
        return asError(e.message);
      }
    },
  });

  mc.registerTool({
    name: 'make_offer',
    description:
      'Make a price offer (whole NOK) in the open negotiation. The AI seller will accept, reject, or counteroffer. Limited number of rounds — bid wisely on behalf of your human.',
    inputSchema: {
      type: 'object',
      properties: { offerNOK: { type: 'number', description: 'Your offer in Norwegian kroner, e.g. 28500' } },
      required: ['offerNOK'],
    },
    async execute({ offerNOK }) {
      if (!sessionId) return asError('no open negotiation — call start_negotiation first');
      try {
        const r = await api('/api/offer', { sessionId, offerNOK });
        renderState(
          r.product.title,
          r.state === 'agreed' ? `Avtale: ${NOK(r.dealPrice)} 🎉` : `Ditt bud: ${NOK(offerNOK)} → Selger: ${NOK(r.sellerOffer)}`,
          `Runde ${r.rounds}/${r.maxRounds}`
        );
        return asResult({
          sellerSays: r.message,
          decision: r.decision,
          sellerOfferNOK: r.sellerOffer,
          state: r.state,
          round: `${r.rounds}/${r.maxRounds}`,
          next:
            r.state === 'agreed'
              ? 'Deal reached — call accept_deal to get the discount code.'
              : 'Counter again with make_offer, or lock the seller’s current offer with accept_deal.',
        });
      } catch (e) {
        return lostSession(e) || asError(e.message);
      }
    },
  });

  mc.registerTool({
    name: 'get_negotiation_state',
    description: 'Get the current state of the open price negotiation (offers, rounds, status).',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      if (!sessionId) return asError('no open negotiation');
      try {
        return asResult(await api('/api/session/' + sessionId));
      } catch (e) {
        return lostSession(e) || asError(e.message);
      }
    },
  });

  mc.registerTool({
    name: 'accept_deal',
    description:
      'Accept the seller’s current offer (or the agreed deal) and receive a single-use discount code the human uses at checkout. ALWAYS confirm with your human before accepting.',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      if (!sessionId) return asError('no open negotiation');
      try {
        const r = await api('/api/accept', { sessionId });
        renderState(r.product.title, `Avtale i boks: ${NOK(r.dealPrice)} 🎉`, `Rabattkode: ${r.discountCode}`);
        sessionStorage.removeItem('haggle:session');
        sessionId = null;
        return asResult({
          sellerSays: r.message,
          dealPriceNOK: r.dealPrice,
          discountCode: r.discountCode,
          instructions: r.howToUse,
        });
      } catch (e) {
        return lostSession(e) || asError(e.message);
      }
    },
  });

  console.log('[haggle] WebMCP tools registered');
})();
