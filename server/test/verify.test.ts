import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createPublicKey, verify } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The real server on a free port, using the key this test creates in the shared temp data folder.
const dataDir = mkdtempSync(join(tmpdir(), 'bb-verify-'));
process.env.DATA_DIR = dataDir;
const { loadKeys, signReceipt, canonical } = await import('../src/receipt.ts');
loadKeys();

let child: ChildProcess;
let base = '';

const freePort = (): Promise<number> => new Promise((done, fail) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => { done(p); }); });
  s.on('error', fail);
});

before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${String(port)}`;
  child = spawn(process.execPath, ['server/src/index.ts'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, STUB_LLM: '1', MAIL_DOMAIN: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((done, fail) => {
    child.on('exit', (c) => { fail(new Error(`server exited early with ${String(c)}`)); });
    child.stdout?.on('data', (d: Buffer) => { if (d.toString().includes('listening')) done(); });
  });
});

after(() => { child.kill(); rmSync(dataDir, { recursive: true, force: true }); });

const post = (text: string): Promise<Response> => fetch(`${base}/api/verify`, { method: 'POST', body: text });
const asDownloaded = (r: unknown): string => JSON.stringify(r, null, 2); // what /api/runs/:id/receipt serves

// Bodies shaped like the ones runs.ts builds.
const fileBody = { product: 'Burn Box', run: 'BBX-0101', parent: undefined, what: 'a.py', kind: 'file', verdict: 'malicious', verdictBy: 'rules + model', startedAt: '2026-11-09T10:00:00Z', destroyedAt: '2026-11-09T10:00:20Z', destroyed: true };
const emailBody = { product: 'Burn Box', run: 'BBX-0102', kind: 'email', boxes: [{ run: 'BBX-0103', destroyed: true }], boxesBurned: 2, verdict: 'suspicious', verdictBy: 'rules floor', destroyedAt: '2026-11-09T10:01:00Z', destroyed: true };

test('downloaded file, link and email receipts verify through /api/verify', async () => {
  for (const body of [fileBody, { ...fileBody, kind: 'link' }, emailBody]) {
    const res = await post(asDownloaded(signReceipt(body)));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { valid: true });
  }
});

test('a changed verdict or signature is not valid', async () => {
  const r = signReceipt(fileBody);
  const edited = JSON.parse(asDownloaded(r)) as { body: Record<string, unknown>; signature: string };
  edited.body.verdict = 'safe';
  assert.deepEqual(await (await post(JSON.stringify(edited))).json(), { valid: false });
  const sigless = { ...JSON.parse(asDownloaded(r)) as object, signature: 'AAAA' };
  assert.deepEqual(await (await post(JSON.stringify(sigless))).json(), { valid: false });
});

test('text that is not a receipt is never valid', async () => {
  assert.equal((await post('not json')).status, 400);
  for (const text of ['null', '[]', '{}', '{"body":1,"signature":"x"}']) {
    const res = await post(text);
    if (res.status === 200) assert.equal(((await res.json()) as { valid: boolean }).valid, false);
    else assert.equal(res.status, 400);
  }
});

test('the public key agrees with the server, as the browser check relies on', async () => {
  const pem = await (await fetch(`${base}/api/pubkey`)).text();
  assert.match(pem, /BEGIN PUBLIC KEY/);
  const key = createPublicKey(pem);
  const r = JSON.parse(asDownloaded(signReceipt(fileBody))) as { body: Record<string, unknown>; signature: string };
  assert.equal(verify(null, Buffer.from(canonical(r.body)), key, Buffer.from(r.signature, 'base64')), true);
  r.body.destroyedAt = '2026-01-01T00:00:00Z';
  assert.equal(verify(null, Buffer.from(canonical(r.body)), key, Buffer.from(r.signature, 'base64')), false);
});

test('a verified body carries the fields the page shows', () => {
  const f = JSON.parse(asDownloaded(signReceipt(fileBody))) as { body: Record<string, unknown> };
  for (const k of ['run', 'verdict', 'verdictBy', 'destroyedAt', 'destroyed']) assert.ok(k in f.body, k);
  assert.equal('boxesBurned' in f.body, false); // file receipts: the page shows 1 because destroyed is true
  const e = JSON.parse(asDownloaded(signReceipt(emailBody))) as { body: Record<string, unknown> };
  assert.equal(e.body.boxesBurned, 2);
});
