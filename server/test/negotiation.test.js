import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNegotiation, applyOffer, acceptStanding, publicView, MAX_ROUNDS } from '../src/negotiation.js';

const bike = { id: 'gid://x/1', handle: 'test-bike', title: 'Testsykkel', price: 30000 };

test('floor is never breached, whatever the buyer does', () => {
  const s = createNegotiation(bike, 10); // floor 27000
  for (let i = 0; i < 20; i++) {
    try {
      applyOffer(s, 1);
    } catch {}
    assert.ok(s.sellerOffer >= s.floor, `sellerOffer ${s.sellerOffer} < floor ${s.floor}`);
    if (s.dealPrice != null) assert.ok(s.dealPrice >= s.floor);
  }
});

test('buyer offering asking price gets deal at asking price, not more', () => {
  const s = createNegotiation(bike, 10);
  const d = applyOffer(s, 35000);
  assert.equal(d.kind, 'accept');
  assert.equal(d.dealPrice, 30000);
});

test('reasonable offer above threshold is accepted at the offer', () => {
  const s = createNegotiation(bike, 10);
  const d = applyOffer(s, 29500);
  assert.equal(d.kind, 'accept');
  assert.equal(d.dealPrice, 29500);
});

test('counteroffers converge monotonically', () => {
  const s = createNegotiation(bike, 10);
  let prev = s.sellerOffer;
  for (let i = 0; i < 4; i++) {
    const d = applyOffer(s, 20000);
    if (d.kind === 'accept') break;
    assert.ok(d.sellerOffer < prev, 'seller must concede each round');
    prev = d.sellerOffer;
  }
});

test('round limit produces a final offer, then closed', () => {
  const s = createNegotiation(bike, 10);
  let d;
  for (let i = 0; i < MAX_ROUNDS; i++) d = applyOffer(s, 100);
  assert.equal(d.kind, 'final');
  d = applyOffer(s, 100);
  // after final, state stays open only for acceptStanding; further offers are counted but capped
  assert.ok(['final', 'closed'].includes(d.kind));
});

test('acceptStanding seals at seller offer and floor holds', () => {
  const s = createNegotiation(bike, 10);
  applyOffer(s, 25000);
  const price = acceptStanding(s);
  assert.equal(price, s.sellerOffer);
  assert.ok(price >= s.floor);
  assert.equal(s.state, 'agreed');
});

test('publicView never leaks the floor', () => {
  const s = createNegotiation(bike, 10);
  const v = publicView(s);
  assert.ok(!('floor' in v));
  assert.ok(!JSON.stringify(v).includes(String(s.floor)) || s.sellerOffer === s.floor);
});

test('lowball gets tiny concession', () => {
  const s = createNegotiation(bike, 10);
  const d = applyOffer(s, 5000);
  assert.equal(d.kind, 'reject');
  assert.ok(d.sellerOffer >= 29000, 'barely concedes on lowball');
});
