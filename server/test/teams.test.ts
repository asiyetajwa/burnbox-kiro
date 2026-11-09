import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// These tests start the real server on a free port with a temp data folder. Runs are seeded as finished
// files, so no sandbox is needed. Nothing here detonates anything.
const dataDir = mkdtempSync(join(tmpdir(), 'bb-teams-'));
const SEEDED_CODE = 'seeded-team-code-0123456789abcdef';
let child: ChildProcess;
let base = '';

const freePort = (): Promise<number> => new Promise((done, fail) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => { done(p); }); });
  s.on('error', fail);
});

const seedRun = (n: number, teamId: string | undefined, kind: string, level: string, at: string): void => {
  const id = `BBX-${String(n).padStart(4, '0')}`;
  writeFileSync(join(dataDir, 'runs', `${id}.json`), JSON.stringify({ id, kind, name: `${kind}-${String(n)}`, size: 1, sha256: 'x', status: 'done', createdAt: at, events: [], teamId, verdict: { level, summary: '', reasons: [], tried: [], source: 'rules' } }));
};

async function boot(): Promise<void> {
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
}

before(async () => {
  mkdirSync(join(dataDir, 'runs'), { recursive: true });
  writeFileSync(join(dataDir, 'teams.json'), JSON.stringify([{ id: 'team-seeded', name: 'Seeded', code: SEEDED_CODE, createdAt: '2026-11-01T00:00:00.000Z' }]));
  seedRun(1, undefined, 'file', 'safe', '2026-11-02T10:00:00.000Z');
  seedRun(2, 'team-seeded', 'link', 'malicious', '2026-11-03T10:00:00.000Z');
  seedRun(3, 'team-seeded', 'email', 'suspicious', '2026-11-04T10:00:00.000Z');
  seedRun(4, undefined, 'link', 'suspicious', '2026-11-05T10:00:00.000Z');
  await boot();
});

after(() => { child.kill(); rmSync(dataDir, { recursive: true, force: true }); });

const post = (path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('creating a team returns the code once, and saves it', async () => {
  const res = await post('/api/teams', { name: '  Front   Desk ' });
  assert.equal(res.status, 201);
  const t = await res.json() as { id: string; name: string; code: string; createdAt: string };
  assert.equal(t.name, 'Front Desk');
  assert.ok(t.id && t.createdAt);
  assert.ok(t.code.length >= 32);
  const saved = JSON.parse(readFileSync(join(dataDir, 'teams.json'), 'utf8')) as { code: string }[];
  assert.ok(saved.some((s) => s.code === t.code));
  // Joining never sends the code back.
  const joined = await (await post('/api/teams/join', { code: t.code })).json() as Record<string, unknown>;
  assert.equal(joined.name, 'Front Desk');
  assert.equal('code' in joined, false);
});

test('a team needs a name', async () => {
  assert.equal((await post('/api/teams', { name: '   ' })).status, 400);
  assert.equal((await post('/api/teams', {})).status, 400);
  assert.equal((await post('/api/teams', { name: 'x'.repeat(61) })).status, 400);
});

test('joining with a bad code is rejected', async () => {
  assert.equal((await post('/api/teams/join', { code: 'not-a-real-code-at-all-0000000000' })).status, 400);
  assert.equal((await post('/api/teams/join', { code: 'short' })).status, 400);
  assert.equal((await post('/api/teams/join', {})).status, 400);
  assert.equal((await post('/api/teams/join', { code: SEEDED_CODE })).status, 200);
});

test('a team view holds only that team\'s runs, newest first', async () => {
  const res = await fetch(`${base}/api/runs?team=${SEEDED_CODE}`);
  assert.equal(res.status, 200);
  const list = await res.json() as { id: string; kind: string; verdict: string }[];
  assert.deepEqual(list.map((r) => r.id), ['BBX-0003', 'BBX-0002']);
  assert.deepEqual(list.map((r) => r.verdict), ['suspicious', 'malicious']);
  assert.equal((await fetch(`${base}/api/runs?team=nope-nope-nope-nope-nope-nope`)).status, 400);
});

test('a new team starts empty', async () => {
  const t = await (await post('/api/teams', { name: 'Empty' })).json() as { code: string };
  assert.deepEqual(await (await fetch(`${base}/api/runs?team=${t.code}`)).json(), []);
});

test('team-less runs stay on the public list, and team runs are not on it', async () => {
  const list = await (await fetch(`${base}/api/runs`)).json() as { id: string }[];
  assert.deepEqual(list.map((r) => r.id), ['BBX-0004', 'BBX-0001']);
});

test('an unknown team code stops a run from being created', async () => {
  const bad = await post('/api/runs', { sample: 'benign' }, { 'x-team-code': 'unknown-unknown-unknown-unknown' });
  assert.equal(bad.status, 400);
  const list = await (await fetch(`${base}/api/runs`)).json() as { id: string }[];
  assert.equal(list.length, 2);
});

test('teams and their runs survive a restart', async () => {
  const t = await (await post('/api/teams', { name: 'Persist' })).json() as { code: string };
  child.removeAllListeners('exit');
  child.kill();
  await new Promise((r) => setTimeout(r, 300));
  await boot();
  assert.equal((await post('/api/teams/join', { code: t.code })).status, 200);
  const list = await (await fetch(`${base}/api/runs?team=${SEEDED_CODE}`)).json() as unknown[];
  assert.equal(list.length, 2);
});
