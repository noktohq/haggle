// @ts-check
// Deterministic negotiation engine. All price authority lives here, server-side.
// The agent never sees the floor; every number the seller says is computed and
// clamped in this file regardless of which "voice" (template or LLM) phrases it.

/**
 * @typedef {object} Product
 * @property {string} id        Shopify GID
 * @property {string} handle
 * @property {string} title
 * @property {number} price     Listed price in whole NOK
 */

/**
 * @typedef {object} HistoryEntry
 * @property {'buyer'|'seller'} who
 * @property {number} price
 * @property {boolean} [accepted]
 * @property {boolean} [final]
 * @property {boolean} [lowball]
 */

/**
 * @typedef {object} Session
 * @property {string} productHandle
 * @property {string} productId
 * @property {string} productTitle
 * @property {number} listPrice
 * @property {number} floor       Secret — never serialized to clients
 * @property {number} sellerOffer
 * @property {number} rounds
 * @property {'open'|'agreed'|'closed'} state
 * @property {number|null} dealPrice
 * @property {HistoryEntry[]} history
 * @property {string} [code]      Discount code, set once the deal is minted
 */

/**
 * @typedef {object} Decision
 * @property {'accept'|'counter'|'reject'|'final'|'closed'} kind
 * @property {number} sellerOffer
 * @property {number} [dealPrice]
 */

const MAX_ROUNDS = 6;

/**
 * Round to nearest 50 NOK — bike-shop prices feel human that way.
 * @param {number} n
 * @returns {number}
 */
function toHuman(n) {
  return Math.round(n / 50) * 50;
}

/**
 * Open a negotiation session for one product.
 * @param {Product} product
 * @param {number} maxDiscountPct  Hard ceiling on the discount, in percent
 * @returns {Session}
 */
export function createNegotiation(product, maxDiscountPct) {
  const listPrice = Math.round(Number(product.price));
  // Rounded UP to the next 50, so the max-discount ceiling is never exceeded.
  const floor = Math.ceil((listPrice * (1 - maxDiscountPct / 100)) / 50) * 50;
  return {
    productHandle: product.handle,
    productId: product.id,
    productTitle: product.title,
    listPrice,
    floor, // secret — never serialized to clients
    sellerOffer: listPrice,
    rounds: 0,
    state: 'open', // open | agreed | closed
    dealPrice: null,
    history: [],
  };
}

/**
 * Apply a buyer offer. Mutates the session and returns the seller's decision.
 * @param {Session} s
 * @param {unknown} rawOffer  Untrusted client input, coerced and validated here
 * @returns {Decision}
 */
export function applyOffer(s, rawOffer) {
  if (s.state !== 'open') return { kind: 'closed', sellerOffer: s.sellerOffer };
  const offer = Math.round(Number(rawOffer));
  if (!Number.isFinite(offer) || offer <= 0) throw new Error('invalid offer');

  s.rounds = Math.min(s.rounds + 1, MAX_ROUNDS);
  s.history.push({ who: 'buyer', price: offer });

  // Buyer meets or beats our standing ask → deal at our ask (never charge more than asked).
  if (offer >= s.sellerOffer) {
    s.state = 'agreed';
    s.dealPrice = s.sellerOffer;
    s.history.push({ who: 'seller', price: s.dealPrice, accepted: true });
    return { kind: 'accept', sellerOffer: s.sellerOffer, dealPrice: s.dealPrice };
  }

  // Acceptance threshold eases toward the final-offer level as rounds pass —
  // never all the way down to the floor, so a scripted lowballer can't undercut
  // the "immovable" final offer by probing for the floor itself.
  const gapAll = s.listPrice - s.floor;
  const ease = Math.min(1, s.rounds / MAX_ROUNDS);
  const finalAsk = Math.max(s.floor, toHuman(s.floor + gapAll * 0.05));
  const acceptAt = Math.max(toHuman(s.floor + gapAll * 0.3 * (1 - ease)), finalAsk);
  if (offer >= acceptAt && offer >= s.floor) {
    s.state = 'agreed';
    s.dealPrice = offer;
    s.history.push({ who: 'seller', price: offer, accepted: true });
    return { kind: 'accept', sellerOffer: offer, dealPrice: offer };
  }

  // Out of rounds → one immovable final offer; anything less stays open only for accept_deal.
  if (s.rounds >= MAX_ROUNDS) {
    s.sellerOffer = finalAsk;
    s.history.push({ who: 'seller', price: s.sellerOffer, final: true });
    return { kind: 'final', sellerOffer: s.sellerOffer };
  }

  // Counteroffer: concede a share of the distance down toward max(floor, offer),
  // smaller share when the buyer lowballs hard.
  const lowball = offer < s.floor * 0.7;
  const target = Math.max(s.floor, offer);
  const concession = (s.sellerOffer - target) * (lowball ? 0.12 : 0.35);
  const next = Math.max(s.floor, toHuman(s.sellerOffer - Math.max(concession, 100)));
  s.sellerOffer = Math.min(next, s.sellerOffer - 50); // always move at least a step
  if (s.sellerOffer < s.floor) s.sellerOffer = s.floor;
  s.history.push({ who: 'seller', price: s.sellerOffer, lowball });
  return { kind: lowball ? 'reject' : 'counter', sellerOffer: s.sellerOffer };
}

/**
 * Buyer accepts the seller's standing offer.
 * @param {Session} s
 * @returns {number} The sealed deal price
 */
export function acceptStanding(s) {
  if (s.state === 'agreed') return /** @type {number} */ (s.dealPrice);
  if (s.state !== 'open') throw new Error('negotiation closed');
  s.state = 'agreed';
  s.dealPrice = s.sellerOffer;
  s.history.push({ who: 'buyer', price: s.dealPrice, accepted: true });
  return s.dealPrice;
}

/**
 * Client-safe view — floor stays secret.
 * @param {Session} s
 */
export function publicView(s) {
  return {
    product: { handle: s.productHandle, title: s.productTitle, listPrice: s.listPrice },
    sellerOffer: s.sellerOffer,
    rounds: s.rounds,
    maxRounds: MAX_ROUNDS,
    state: s.state,
    dealPrice: s.dealPrice,
  };
}

export { MAX_ROUNDS, toHuman };
