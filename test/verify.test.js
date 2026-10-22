// Acceptance tests, named after the job's acceptance lines:
//   "Tests on recorded transaction fixtures: right fee, short fee, wrong mint,
//    wrong payee, expired quote, replay."
//
// Every test fails against a verifier that does not check the named condition.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyKogFee } from '../src/verify.js';
import { txPaying, quote, MINT, PAYEE, OTHER, PAYER } from './fixtures.js';

test('A1 right fee is accepted', () => {
  const r = verifyKogFee({ tx: txPaying({ amount: '1000' }), quote: quote({ amount: '1000' }) });
  assert.equal(r.ok, true, r.reason);
});

test('A1b fee above the quote is accepted', () => {
  const r = verifyKogFee({ tx: txPaying({ amount: '2500' }), quote: quote({ amount: '1000' }) });
  assert.equal(r.ok, true, r.reason);
});

test('A2 short fee is refused', () => {
  const r = verifyKogFee({ tx: txPaying({ amount: '999' }), quote: quote({ amount: '1000' }) });
  assert.equal(r.ok, false);
  assert.match(r.reason, /short fee/);
});

test('A3 wrong mint is refused', () => {
  const r = verifyKogFee({
    tx: txPaying({ mint: OTHER, amount: '1000' }),
    quote: quote({ mint: MINT, amount: '1000' }),
  });
  assert.equal(r.ok, false);
});

test('A3b explicit mint argument must match, not just the quote', () => {
  const r = verifyKogFee({
    tx: txPaying({ mint: MINT, amount: '1000' }),
    quote: quote({ mint: MINT, amount: '1000' }),
    mint: OTHER,
  });
  assert.equal(r.ok, false);
});

test('A4 wrong payee is refused', () => {
  const r = verifyKogFee({
    tx: txPaying({ payee: OTHER, amount: '1000' }),
    quote: quote({ payee: PAYEE, amount: '1000' }),
  });
  assert.equal(r.ok, false);
});

test('A5 expired quote is refused', () => {
  const r = verifyKogFee({
    tx: txPaying({ amount: '1000', blockTime: 1_700_000_200 }),
    quote: quote({ amount: '1000', expiresAt: 1_700_000_100 }),
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /expired/);
});

test('A5b missing block time cannot prove a live quote and is refused', () => {
  const tx = txPaying({ amount: '1000' });
  delete tx.blockTime;
  const r = verifyKogFee({ tx, quote: quote({ amount: '1000', expiresAt: 1_700_000_100 }) });
  assert.equal(r.ok, false);
});

test('A6 replay is refused on the second call', () => {
  const seen = new Set();
  const tx = txPaying({ amount: '1000' });
  const q = quote({ amount: '1000' });
  const first = verifyKogFee({ tx, quote: q, seen });
  const second = verifyKogFee({ tx, quote: q, seen });
  assert.equal(first.ok, true, first.reason);
  assert.equal(second.ok, false);
  assert.match(second.reason, /replay/);
});

test('A6b distinct signatures both pass', () => {
  const seen = new Set();
  const q = quote({ amount: '1000' });
  const a = verifyKogFee({ tx: txPaying({ amount: '1000', signature: 'SigA' }), quote: q, seen });
  const b = verifyKogFee({ tx: txPaying({ amount: '1000', signature: 'SigB' }), quote: q, seen });
  assert.equal(a.ok, true, a.reason);
  assert.equal(b.ok, true, b.reason);
});

test('A7 failed transaction never settles a payment', () => {
  const r = verifyKogFee({
    tx: txPaying({ amount: '1000', err: { InstructionError: [0, 'Custom'] } }),
    quote: quote({ amount: '1000' }),
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /failed/);
});

test('A8 a balance that does not increase is not a payment (delta, not balance)', () => {
  // payee already held 5000 before and after: no credit from this tx.
  const r = verifyKogFee({
    tx: txPaying({ amount: '0', preAmount: '5000' }),
    quote: quote({ amount: '1000' }),
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /short fee/);
});

test('A9 evidence is only consumed on success, so a refusal keeps the signature fresh', () => {
  const seen = new Set();
  const q = quote({ amount: '1000' });
  const short = verifyKogFee({ tx: txPaying({ amount: '1', signature: 'SigX' }), quote: q, seen });
  assert.equal(short.ok, false);
  const ok = verifyKogFee({ tx: txPaying({ amount: '1000', signature: 'SigX' }), quote: q, seen });
  assert.equal(ok.ok, true, ok.reason);
});
