import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'bb-test-'));
const { loadKeys, signReceipt, verifyReceipt, canonical } = await import('../src/receipt.ts');
loadKeys();

test('canonical JSON ignores key order', () => {
  assert.equal(canonical({ b: 1, a: { d: 2, c: 3 } }), canonical({ a: { c: 3, d: 2 }, b: 1 }));
});

test('a signed receipt verifies, and any change breaks it', () => {
  const r = signReceipt({ run: 'BBX-0001', verdict: 'malicious', destroyedAt: '2026-11-04T09:12:09Z' });
  assert.equal(verifyReceipt(r), true);
  assert.equal(verifyReceipt({ ...r, body: { ...r.body, verdict: 'safe' } }), false);
});

const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

test('a receipt with parent undefined still verifies after a JSON round trip', () => {
  const r = signReceipt({ run: 'BBX-0002', parent: undefined, verdict: 'safe', destroyed: true });
  assert.equal(verifyReceipt(r), true);
  assert.equal(verifyReceipt(roundTrip(r)), true);
});

test('a receipt signed the old way (parent written as undefined) still verifies', async () => {
  const { createPrivateKey, sign } = await import('node:crypto');
  const { readFileSync } = await import('node:fs');
  const priv = createPrivateKey(readFileSync(join(process.env.DATA_DIR as string, 'keys', 'receipt-ed25519.pem')));
  const legacyBytes = '{"destroyed":true,"parent":undefined,"run":"BBX-0003","verdict":"malicious"}';
  const old = { body: { run: 'BBX-0003', verdict: 'malicious', destroyed: true }, signature: sign(null, Buffer.from(legacyBytes), priv).toString('base64'), algorithm: 'ed25519' as const };
  assert.equal(verifyReceipt(old), true);
  assert.equal(verifyReceipt({ ...old, body: { ...old.body, verdict: 'safe' } }), false);
  assert.equal(verifyReceipt({ ...old, body: { ...old.body, parent: 'BBX-0001' } }), false);
});

test('bad shapes never verify', () => {
  const r = signReceipt({ run: 'BBX-0004' });
  assert.equal(verifyReceipt({ ...r, signature: 'AAAA' }), false);
  assert.equal(verifyReceipt({ ...r, signature: 42 as unknown as string }), false);
  assert.equal(verifyReceipt({ signature: r.signature, algorithm: 'ed25519' } as never), false);
});
