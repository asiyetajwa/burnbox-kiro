// Burn Box control server: the web app, the run API and the live event stream.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { config } from './config.ts';
import { loadKeys, publicKeyPem, verifyReceipt, type Receipt } from './receipt.ts';
import { createRun, getRun, listRuns, loadRuns, looksLikeEmail, sampleInput, samplesList, subscribe, type Run } from './runs.ts';
import { mailAddress, startMail } from './mail.ts';
import { cleanName, createTeam, loadTeams, publicTeam, teamByCode } from './teams.ts';
import { sandboxStatus, sweep } from './sandbox.ts';

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};

function send(res: ServerResponse, code: number, body: unknown, headers: Record<string, string> = {}): void {
  const isText = typeof body === 'string' || Buffer.isBuffer(body);
  res.writeHead(code, { ...SECURITY, 'cache-control': 'no-store', 'content-type': isText ? 'text/plain; charset=utf-8' : 'application/json', ...headers });
  res.end(isText ? body : JSON.stringify(body));
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    let n = 0;
    req.on('data', (c: Buffer) => {
      n += c.length;
      if (n > limit) { fail(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => done(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}

// A small per-address allowance keeps a public demo from being used as a free sandbox farm.
const allowance = new Map<string, number[]>();
const RUNS_PER_HOUR = Number(process.env.RUNS_PER_HOUR ?? 30);
function allowed(ip: string): boolean {
  const now = Date.now();
  const list = (allowance.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (list.length >= RUNS_PER_HOUR) { allowance.set(ip, list); return false; }
  list.push(now);
  allowance.set(ip, list);
  return true;
}

/** What the browser sees of a run. The canary values and the raw box report stay on the server. */
function publicRun(r: Run): Record<string, unknown> {
  const rep = r.box?.report ?? null;
  return {
    id: r.id, kind: r.kind, name: r.name, size: r.size, sha256: r.sha256, status: r.status, createdAt: r.createdAt, error: r.error,
    facts: r.facts, verdict: r.verdict, receipt: r.receipt, email: r.email, parent: r.parent, children: r.children, via: r.via,
    box: r.box ? { container: r.box.container.slice(0, 12), limits: r.box.limits, startedAt: r.box.startedAt, destroyedAt: r.box.destroyedAt, destroyed: r.box.destroyed } : undefined,
    events: r.events,
    stdout: rep ? String(rep.stdout ?? '').slice(0, 4000) : undefined,
    duration: rep?.duration,
    screenshot: rep && typeof rep.screenshot === 'string' ? rep.screenshot : undefined,
  };
}

function summary(r: Run): Record<string, unknown> {
  const kids = (r.children ?? []).map(getRun).filter((k): k is Run => Boolean(k));
  const all = [r, ...kids];
  return {
    id: r.id, kind: r.kind, name: r.name, status: r.status, createdAt: r.createdAt, verdict: r.verdict?.level, via: r.via,
    canaries: all.reduce((n, k) => n + (k.facts ? k.facts.canaries.length : 0), 0),
    canariesPlanted: r.kind === 'email' ? kids.reduce((n, k) => n + (k.kind === 'link' ? 1 : 3), 0) : r.kind === 'link' ? 1 : 3,
    egress: all.reduce((n, k) => n + (k.facts?.egressTotal ?? 0), 0),
    boxes: all.length,
    destroyedAt: r.receipt?.body.destroyedAt ?? r.box?.destroyedAt,
  };
}

// Team creation is limited too, so a public demo cannot be filled with teams.
const teamMakers = new Map<string, number[]>();
function mayMakeTeam(ip: string): boolean {
  const now = Date.now();
  const list = (teamMakers.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (list.length >= 10) { teamMakers.set(ip, list); return false; }
  list.push(now);
  teamMakers.set(ip, list);
  return true;
}

const validUrl = (s: string): boolean => {
  try {
    const u = new URL(s);
    return (u.protocol === 'http:' || u.protocol === 'https:') && s.length < 2000;
  } catch { return false; }
};

async function api(req: IncomingMessage, res: ServerResponse, path: string, url: URL): Promise<void> {
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();

  if (path === '/api/health') {
    send(res, 200, { ok: true, sandbox: await sandboxStatus(), inference: config.llm.stub ? 'stub' : config.llm.model || 'auto', forwardTo: mailAddress() });
    return;
  }
  if (path === '/api/samples' && req.method === 'GET') { send(res, 200, samplesList()); return; }
  if (path === '/api/pubkey') { send(res, 200, publicKeyPem()); return; }
  if (path === '/api/verify' && req.method === 'POST') {
    try {
      const r = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8')) as Receipt;
      send(res, 200, { valid: verifyReceipt(r) });
    } catch { send(res, 400, { error: 'Send the receipt JSON exactly as downloaded.' }); }
    return;
  }
  if (path === '/api/teams' && req.method === 'POST') {
    if (!mayMakeTeam(ip)) { send(res, 429, { error: 'This address has made enough teams for the hour. Try again later.' }); return; }
    let name: string | undefined;
    try { name = cleanName((JSON.parse((await readBody(req, 4 * 1024)).toString('utf8')) as { name?: unknown }).name); } catch { name = undefined; }
    if (!name) { send(res, 400, { error: 'Give the team a name of 1 to 60 characters.' }); return; }
    send(res, 201, createTeam(name)); // the only time the code is sent
    return;
  }
  if (path === '/api/teams/join' && req.method === 'POST') {
    let code: unknown;
    try { code = (JSON.parse((await readBody(req, 4 * 1024)).toString('utf8')) as { code?: unknown }).code; } catch { code = undefined; }
    const team = teamByCode(code);
    if (!team) { send(res, 400, { error: 'That team code was not found. Check it and try again.' }); return; }
    send(res, 200, publicTeam(team));
    return;
  }
  if (path === '/api/runs' && req.method === 'GET') {
    const code = url.searchParams.get('team');
    if (code === null) { send(res, 200, listRuns().slice(0, 50).map(summary)); return; }
    const team = teamByCode(code);
    if (!team) { send(res, 400, { error: 'That team code was not found. Check it and try again.' }); return; }
    send(res, 200, listRuns(team.id).slice(0, 50).map(summary));
    return;
  }
  if (path === '/api/runs' && req.method === 'POST') {
    const codeHeader = req.headers['x-team-code'];
    let teamId: string | undefined;
    if (codeHeader !== undefined) {
      const team = teamByCode(Array.isArray(codeHeader) ? codeHeader[0] : codeHeader);
      if (!team) { send(res, 400, { error: 'That team code was not found. Leave the team and join again.' }); return; }
      teamId = team.id;
    }
    if (!allowed(ip)) { send(res, 429, { error: 'This address has used its runs for the hour. Try again later.' }); return; }
    const ct = String(req.headers['content-type'] ?? '');
    let body: Buffer;
    try { body = await readBody(req, ct.includes('json') ? 16 * 1024 : config.maxUpload); }
    catch { send(res, 413, { error: `Files can be up to ${String(config.maxUpload / 1048576)} MB.` }); return; }
    if (ct.includes('json')) {
      let o: { sample?: string; url?: string; via?: string };
      try { o = JSON.parse(body.toString('utf8')) as { sample?: string; url?: string; via?: string }; } catch { send(res, 400, { error: 'The request could not be read.' }); return; }
      if (o.sample) {
        const s = sampleInput(o.sample);
        if (!s) { send(res, 404, { error: 'No such test sample.' }); return; }
        send(res, 202, publicRun(createRun(s.kind, s.name, s.input, { sample: o.sample, teamId })));
        return;
      }
      if (o.url) {
        if (!validUrl(o.url)) { send(res, 400, { error: 'Paste a full link that starts with http:// or https://.' }); return; }
        const u = new URL(o.url);
        send(res, 202, publicRun(createRun('link', `${u.host}${u.pathname === '/' ? '' : u.pathname}`.slice(0, 120), Buffer.from(o.url), { teamId, via: o.via === 'quick' ? 'quick' : undefined })));
        return;
      }
      send(res, 400, { error: 'Choose a file, a link or a test sample.' });
      return;
    }
    if (!body.length) { send(res, 400, { error: 'The file is empty.' }); return; }
    const name = decodeURIComponent(url.searchParams.get('name') ?? 'sample').slice(0, 120);
    send(res, 202, publicRun(createRun(looksLikeEmail(name, body) ? 'email' : 'file', name, body, { teamId })));
    return;
  }
  const m = /^\/api\/runs\/(BBX-\d{4,})(\/events|\/receipt)?$/.exec(path);
  if (m) {
    const r = getRun(m[1]);
    if (!r) { send(res, 404, { error: 'No such run.' }); return; }
    if (!m[2]) { send(res, 200, publicRun(r)); return; }
    if (m[2] === '/receipt') {
      if (!r.receipt) { send(res, 409, { error: 'The receipt is written when the box has burned.' }); return; }
      send(res, 200, JSON.stringify(r.receipt, null, 2), { 'content-type': 'application/json', 'content-disposition': `attachment; filename="burn-box-receipt-${r.id}.json"` });
      return;
    }
    // Live events (server-sent). Past events replay first, then new ones stream until the run ends.
    res.writeHead(200, { ...SECURITY, 'content-type': 'text/event-stream', 'cache-control': 'no-store, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const write = (e: unknown): void => { res.write(`data: ${JSON.stringify(e)}\n\n`); };
    for (const e of r.events) write(e);
    if (r.status === 'done' || r.status === 'error') { write({ type: 'end' }); res.end(); return; }
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    const off = subscribe(r.id, (e) => {
      write(e);
      if (e.type === 'done' || e.type === 'error') { write({ type: 'end' }); clearInterval(ping); off(); res.end(); }
    });
    req.on('close', () => { clearInterval(ping); off(); });
    return;
  }
  send(res, 404, { error: 'Not found.' });
}

async function serveStatic(res: ServerResponse, path: string): Promise<void> {
  const rel = normalize(path === '/' || !extname(path) ? '/index.html' : path).replace(/^(\.\.[/\\])+/, '');
  const file = join(config.webDir, rel);
  if (!file.startsWith(config.webDir)) { send(res, 404, 'Not found'); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { ...SECURITY, 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=300' });
    res.end(data);
  } catch { send(res, 404, 'Not found'); }
}

loadKeys();
loadRuns();
loadTeams();
const swept = await sweep().catch(() => 0);
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://local');
  const path = url.pathname;
  const handle = path.startsWith('/api/') ? api(req, res, path, url) : serveStatic(res, path);
  handle.catch((e: unknown) => { if (!res.headersSent) send(res, 500, { error: 'Something went wrong on the server.' }); console.error(e); });
});
server.listen(config.port, config.host, () => {
  console.log(`Burn Box listening on ${config.host}:${String(config.port)} (inference: ${config.llm.stub ? 'stub' : config.llm.model || 'auto'}${swept ? `, burned ${String(swept)} leftover boxes` : ''})`);
});
startMail();
