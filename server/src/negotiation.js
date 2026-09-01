// Deterministic negotiation engine. All price authority lives here, server-side.
// The agent never sees the floor; every number the seller says is computed and
// clamped in this file regardless of which "voice" (template or LLM) phrases it.

const MAX_ROUNDS = 6;

/** Round to nearest 50 NOK — bike-shop prices feel human that way. */
function toHuman(n) {
  return Math.round(n / 50) * 50;
}

export function createNegotiation(product, maxDiscountPct) {
  const listPrice = Math.round(Number(product.price));
  const floor = toHuman(listPrice * (1 - maxDiscountPct / 100));
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
 * Apply a buyer offer. Mutates and returns the session with a decision:
 * {kind: 'accept'|'counter'|'reject'|'final'|'closed', sellerOffer, dealPrice?}
 */
export function applyOffer(s, rawOffer) {
  if (s.state !== 'open') return { kind: 'closed', sellerOffer: s.sellerOffer };
  const offer = Math.round(Number(rawOffer));
  if (!Number.isFinite(offer) || offer <= 0) throw new Error('invalid offer');

  s.rounds += 1;
  s.history.push({ who: 'buyer', price: offer });

  // Buyer meets or beats our standing ask → deal at our ask (never charge more than asked).
  if (offer >= s.sellerOffer) {
    s.state = 'agreed';
    s.dealPrice = s.sellerOffer;
    s.history.push({ who: 'seller', price: s.dealPrice, accepted: true });
    return { kind: 'accept', sellerOffer: s.sellerOffer, dealPrice: s.dealPrice };
  }

  // Acceptance threshold eases toward the floor as rounds pass.
  const gapAll = s.listPrice - s.floor;
  const ease = Math.min(1, s.rounds / MAX_ROUNDS);
  const acceptAt = toHuman(s.floor + gapAll * 0.3 * (1 - ease));
  if (offer >= acceptAt && offer >= s.floor) {
    s.state = 'agreed';
    s.dealPrice = offer;
    s.history.push({ who: 'seller', price: offer, accepted: true });
    return { kind: 'accept', sellerOffer: offer, dealPrice: offer };
  }

  // Out of rounds → one immovable final offer; anything less stays open only for accept_deal.
  if (s.rounds >= MAX_ROUNDS) {
    s.sellerOffer = Math.max(s.floor, toHuman(s.floor + gapAll * 0.05));
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

/** Buyer accepts the seller's standing offer. */
export function acceptStanding(s) {
  if (s.state === 'agreed') return s.dealPrice;
  if (s.state !== 'open') throw new Error('negotiation closed');
  s.state = 'agreed';
  s.dealPrice = s.sellerOffer;
  s.history.push({ who: 'buyer', price: s.dealPrice, accepted: true });
  return s.dealPrice;
}

/** Client-safe view — floor stays secret. */
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
