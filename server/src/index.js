// Haggle negotiation service — zero-dependency Node 20 HTTP server.
// Run: node src/index.js   (see ../.env.example for configuration)

import http from 'node:http';
import crypto from 'node:crypto';
import { createNegotiation, applyOffer, acceptStanding, publicView } from './negotiation.js';
import { fetchProductByHandle, createDealDiscount, MOCK_CATALOG } from './shopify.js';
import { sellerMessage } from './seller.js';

const PORT = Number(process.env.PORT) || 8080;
const MAX_DISCOUNT_PCT = Math.min(50, Math.max(0, Number(process.env.MAX_DISCOUNT_PCT) || 10));
const SESSION_LIMIT = 500; // in-memory demo store; oldest evicted first

const sessions = new Map();

function newSessionId() {
  return crypto.randomBytes(9).toString('base64url');
}

function corsHeaders(origin) {
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok =
    !origin ||
    allowed.includes('*') ||
    allowed.includes(origin) ||
    (allowed.length === 0 && /^https:\/\/[a-z0-9-]+\.myshopify\.com$/.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin || '*' : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Error('body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  const headers = corsHeaders(req.headers.origin);
  if (req.method === 'OPTIONS') return void send(res, 204, headers, {});
  const url = new URL(req.url, 'http://x');

  try {
    if (req.method === 'GET' && url.pathname === '/healthz') {
      return void send(res, 200, headers, { ok: true, mock: process.env.MOCK_PRODUCTS === '1' });
    }

    if (req.method === 'GET' && url.pathname === '/api/products') {
      // Mock mode only — live mode lists products via the storefront's own /products.json
      return void send(res, 200, headers, { products: MOCK_CATALOG.map(({ id, ...p }) => p) });
    }

    if (req.method === 'POST' && url.pathname === '/api/session') {
      const { productHandle } = await readJson(req);
      if (typeof productHandle !== 'string' || !/^[a-z0-9-]{1,120}$/.test(productHandle)) {
        return void send(res, 400, headers, { error: 'invalid productHandle' });
      }
      const product = await fetchProductByHandle(productHandle);
      const s = createNegotiation(product, MAX_DISCOUNT_PCT);
      const id = newSessionId();
      if (sessions.size >= SESSION_LIMIT) sessions.delete(sessions.keys().next().value);
      sessions.set(id, s);
      const message = `Velkommen! ${s.productTitle} står i ${s.listPrice} kr. Men jeg hører gjerne et bud.`;
      return void send(res, 200, headers, { sessionId: id, message, ...publicView(s) });
    }

    const m = url.pathname.match(/^\/api\/session\/([A-Za-z0-9_-]{1,32})$/);
    if (req.method === 'GET' && m) {
      const s = sessions.get(m[1]);
      if (!s) return void send(res, 404, headers, { error: 'unknown session' });
      return void send(res, 200, headers, publicView(s));
    }

    if (req.method === 'POST' && url.pathname === '/api/offer') {
      const { sessionId, offerNOK } = await readJson(req);
      const s = sessions.get(String(sessionId));
      if (!s) return void send(res, 404, headers, { error: 'unknown session' });
      let decision;
      try {
        decision = applyOffer(s, offerNOK);
      } catch {
        return void send(res, 400, headers, { error: 'invalid offer' });
      }
      const message = await sellerMessage(
        decision.kind,
        { title: s.productTitle, offer: Math.round(Number(offerNOK)), sellerOffer: decision.sellerOffer, dealPrice: decision.dealPrice },
        s.rounds
      );
      return void send(res, 200, headers, { decision: decision.kind, message, ...publicView(s) });
    }

    if (req.method === 'POST' && url.pathname === '/api/accept') {
      const { sessionId } = await readJson(req);
      const s = sessions.get(String(sessionId));
      if (!s) return void send(res, 404, headers, { error: 'unknown session' });
      let dealPrice;
      try {
        dealPrice = acceptStanding(s);
      } catch {
        return void send(res, 409, headers, { error: 'negotiation closed' });
      }
      if (!s.code) {
        const { code } = await createDealDiscount(s);
        s.code = code;
        s.state = 'closed';
      }
      const message = await sellerMessage('accept', { title: s.productTitle, dealPrice, sellerOffer: dealPrice }, s.rounds);
      return void send(res, 200, headers, {
        message,
        dealPrice,
        discountCode: s.code,
        howToUse: `Legg ${s.productTitle} i handlekurven og bruk koden ${s.code} i kassen. Gyldig i 48 timer, kun ett kjøp.`,
        ...publicView(s),
      });
    }

    send(res, 404, headers, { error: 'not found' });
  } catch (err) {
    send(res, 500, headers, { error: 'internal error' });
    console.error(`[haggle] ${req.method} ${url.pathname}: ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`haggle listening on :${PORT} (maxDiscount=${MAX_DISCOUNT_PCT}%, mock=${process.env.MOCK_PRODUCTS === '1'})`);
});
