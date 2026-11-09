import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Starts the real server on a free port with a temp data folder. With no Docker the box fails and the run
// ends in error. The tag and the listing do not depend on that, so nothing here needs a sandbox.
const dataDir = mkdtempSync(join(tmpdir(), 'bb-quick-'));
const CODE = 'quick-team-code-0123456789abcdef0';
let child: ChildProcess;
let base = '';

const freePort = (): Promise<number> => new Promise((done, fail) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => { done(p); }); });
  s.on('error', fail);
});

before(async () => {
  mkdirSync(join(dataDir, 'runs'), { recursive: true });
  writeFileSync(join(dataDir, 'teams.json'), JSON.stringify([{ id: 'team-q', name: 'Quick', code: CODE, createdAt: '2026-11-01T00:00:00.000Z' }]));
  const port = await freePort();
  base = `http://127.0.0.1:${String(port)}`;
  child = spawn(process.execPath, ['server/src/index.ts'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, STUB_LLM: '1', MAIL_DOMAIN: '', RUNS_PER_HOUR: '100' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((done, fail) => {
    child.on('exit', (c) => { fail(new Error(`server exited early with ${String(c)}`)); });
    child.stdout?.on('data', (d: Buffer) => { if (d.toString().includes('listening')) done(); });
  });
});

after(() => { child.kill(); rmSync(dataDir, { recursive: true, force: true }); });

const postRun = (body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(`${base}/api/runs`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

type RunView = { id: string; kind: string; via: string };

test('a link run with via quick keeps the tag in the response, detail, list and saved file', async () => {
  const res = await postRun({ url: 'http://quick-one.example/a', via: 'quick' });
  assert.equal(res.status, 202);
  const run = await res.json() as RunView;
  assert.equal(run.kind, 'link');
  assert.equal(run.via, 'quick');
  const detail = await (await fetch(`${base}/api/runs/${run.id}`)).json() as RunView;
  assert.equal(detail.via, 'quick');
  const list = await (await fetch(`${base}/api/runs`)).json() as RunView[];
  assert.equal(list.find((r) => r.id === run.id)?.via, 'quick');
  const saved = JSON.parse(readFileSync(join(dataDir, 'runs', `${run.id}.json`), 'utf8')) as RunView;
  assert.equal(saved.via, 'quick');
});

test('a quick run with a team code lands in the team list, not the public list', async () => {
  const run = await (await postRun({ url: 'http://quick-two.example/', via: 'quick' }, { 'x-team-code': CODE })).json() as RunView;
  const team = await (await fetch(`${base}/api/runs?team=${CODE}`)).json() as RunView[];
  assert.equal(team.find((r) => r.id === run.id)?.via, 'quick');
  const pub = await (await fetch(`${base}/api/runs`)).json() as RunView[];
  assert.equal(pub.some((r) => r.id === run.id), false);
});

test('only quick is accepted from a client; email and unknown values become web', async () => {
  for (const via of ['email', 'admin', 42, null, undefined]) {
    const res = await postRun({ url: 'http://quick-three.example/', via });
    assert.equal(res.status, 202);
    assert.equal(((await res.json()) as RunView).via, 'web');
  }
});

test('a link run without via is tagged web', async () => {
  const run = await (await postRun({ url: 'http://quick-four.example/' })).json() as RunView;
  assert.equal(run.via, 'web');
});

test('a bad link is still rejected for a quick run', async () => {
  assert.equal((await postRun({ url: 'not a link', via: 'quick' })).status, 400);
});
