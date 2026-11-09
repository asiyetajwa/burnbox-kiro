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
