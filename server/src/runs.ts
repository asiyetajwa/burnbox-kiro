// Run lifecycle: queue, detonate, verdict, receipt. Runs are kept in memory and saved as JSON files.
// An email run opens the email in a box, then sends every link and attachment into a box of its own
// (child runs) and writes one verdict and one receipt for the whole email.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.ts';
import { detonate, makeCanaries, type BoxEvent, type BoxResult } from './sandbox.ts';
import { factsFrom, writeEmailVerdict, verdictBy, writeVerdict, type ChildSummary, type EmailFacts, type Facts, type Finding, type Verdict } from './verdict.ts';
import { signReceipt, type Receipt } from './receipt.ts';

export type Kind = 'file' | 'link' | 'email';
export type Status = 'queued' | 'running' | 'judging' | 'done' | 'error';
export type Run = {
  id: string;
  kind: Kind;
  name: string;
  size: number;
  sha256: string;
  sample?: string;
  via?: 'web' | 'email';
  parent?: string;
  children?: string[];
  status: Status;
  createdAt: string;
  events: (BoxEvent & { at: string })[];
  box?: Omit<BoxResult, 'report'> & { report?: Record<string, unknown> | null };
  facts?: Facts;
  email?: EmailFacts;
  verdict?: Verdict;
  receipt?: Receipt;
  error?: string;
};

const runs = new Map<string, Run>();
const listeners = new Map<string, Set<(e: BoxEvent & { at: string }) => void>>();
const queue: { run: Run; input: Buffer }[] = [];
let active = 0;
let counter = 400;

const runsDir = (): string => join(config.dataDir, 'runs');

export function loadRuns(): void {
  mkdirSync(runsDir(), { recursive: true });
  for (const f of readdirSync(runsDir()).filter((n) => n.endsWith('.json'))) {
    try {
      const r = JSON.parse(readFileSync(join(runsDir(), f), 'utf8')) as Run;
      if (r.status !== 'done') r.status = 'error';
      runs.set(r.id, r);
      counter = Math.max(counter, Number(r.id.replace(/\D/g, '')) || 0);
    } catch { /* skip a damaged file */ }
  }
}

function save(r: Run): void {
  // Attachment bytes pulled from an email are not kept in the saved run.
  const rep = r.box?.report;
  const copy = rep && Array.isArray(rep.attachments)
    ? { ...r, box: r.box ? { ...r.box, report: { ...rep, attachments: (rep.attachments as Record<string, unknown>[]).map(({ data: _d, ...a }) => a) } } : r.box }
    : r;
  writeFileSync(join(runsDir(), `${r.id}.json`), JSON.stringify(copy));
}

function push(r: Run, e: BoxEvent): void {
  const ev = { ...e, at: new Date().toISOString() };
  if (e.type !== 'screenshot') r.events.push(ev);
  for (const fn of listeners.get(r.id) ?? []) fn(ev);
}

export function subscribe(id: string, fn: (e: BoxEvent & { at: string }) => void): () => void {
  const set = listeners.get(id) ?? new Set();
  set.add(fn);
  listeners.set(id, set);
  return () => { set.delete(fn); };
}

export function getRun(id: string): Run | undefined { return runs.get(id); }
export function listRuns(): Run[] { return [...runs.values()].filter((r) => !r.parent).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }

export function createRun(kind: Kind, name: string, input: Buffer, opts: { sample?: string; parent?: string; via?: 'web' | 'email'; front?: boolean } = {}): Run {
  counter += 1;
  const r: Run = {
    id: `BBX-${String(counter).padStart(4, '0')}`, kind, name, size: input.length,
    sha256: createHash('sha256').update(input).digest('hex'), sample: opts.sample, parent: opts.parent, via: opts.via ?? 'web',
    status: 'queued', createdAt: new Date().toISOString(), events: [],
  };
  runs.set(r.id, r);
  save(r);
  if (opts.front) queue.unshift({ run: r, input }); else queue.push({ run: r, input });
  pump();
  return r;
}

function pump(): void {
  while (active < config.maxConcurrent && queue.length) {
    const next = queue.shift();
    if (!next) return;
    active += 1;
    execute(next.run, next.input).finally(() => { active -= 1; pump(); });
  }
}

function fail(r: Run, message: string): void {
  r.status = 'error';
  r.error = message;
  push(r, { type: 'error', message });
  save(r);
}

async function execute(r: Run, input: Buffer): Promise<void> {
  r.status = 'running';
  push(r, { type: 'stage', stage: 'starting' });
  const canaries = makeCanaries();
  const env: Record<string, string> = { BB_NAME: r.name, BB_CANARIES: JSON.stringify(canaries) };
  if (r.kind === 'link') {
    env.BB_URL = input.toString('utf8');
    if (config.gateUrl) env.BB_PROXY = config.gateUrl;
  }
  if (r.kind === 'email') env.BB_MODE = 'email';
  let box: BoxResult;
  try {
    box = await detonate({ kind: r.kind, name: r.name, input: r.kind === 'link' ? Buffer.alloc(0) : input, env }, (e) => push(r, e));
  } catch (e) {
    fail(r, `The box could not run: ${(e as Error).message}`);
    return;
  }
  const { report, ...rest } = box;
  r.box = { ...rest, report };
  if (!report) {
    fail(r, box.error ?? 'The box returned no record.');
    return;
  }
  // An email's links and attachments are judged in their own boxes. Waiting for them must not hold a box slot.
  if (r.kind === 'email') {
    finishEmail(r, report).catch((e: unknown) => { fail(r, `The email could not be finished: ${(e as Error).message}`); });
    return;
  }

  r.status = 'judging';
  push(r, { type: 'stage', stage: 'verdict' });
  const facts = factsFrom(r.kind, r.name, report);
  r.facts = facts;
  const verdict = await writeVerdict(facts, report, (m) => push(r, { type: 'note', message: m }));
  r.verdict = verdict;
  r.receipt = signReceipt({
    product: 'Burn Box',
    run: r.id,
    parent: r.parent,
    what: r.name,
    kind: r.kind,
    sha256: r.sha256,
    container: box.container,
    limits: box.limits,
    canaries: { planted: r.kind === 'link' ? 1 : 3, reached: facts.canaries.length },
    egressBlocked: facts.egressTotal,
    verdict: verdict.level,
    verdictBy: verdictBy(verdict),
    startedAt: box.startedAt,
    destroyedAt: box.destroyedAt,
    destroyed: box.destroyed,
  });
  r.status = 'done';
  push(r, { type: 'done', verdict: verdict.level });
  save(r);
}

const RELAY = new Set(['stage', 'canary', 'egress', 'lookup', 'write_denied', 'delete_denied', 'post', 'page', 'done', 'error']);

async function finishEmail(r: Run, report: Record<string, unknown>): Promise<void> {
  type Att = { name: string; size: number; data?: string | null };
  type Lnk = { href: string; text: string };
  const atts = (Array.isArray(report.attachments) ? report.attachments : []) as Att[];
  const links = (Array.isArray(report.links) ? report.links : []) as Lnk[];
  const findings = (Array.isArray(report.findings) ? report.findings : []) as Finding[];

  // Fan out: one fresh box per attachment and per link.
  const kids: Run[] = [];
  for (const a of atts) if (a.data) kids.push(createRun('file', a.name, Buffer.from(a.data, 'base64'), { parent: r.id, front: true }));
  for (const l of links) {
    let name = l.href;
    try { const u = new URL(l.href); name = `${u.host}${u.pathname === '/' ? '' : u.pathname}`; } catch { /* keep the raw link */ }
    kids.push(createRun('link', name.slice(0, 120), Buffer.from(l.href), { parent: r.id, front: true }));
  }
  r.children = kids.map((k) => k.id);
  push(r, { type: 'stage', stage: 'fanout', boxes: kids.map((k) => ({ id: k.id, kind: k.kind, name: k.name })) });

  await Promise.all(kids.map((k) => new Promise<void>((done) => {
    const finished = (): boolean => k.status === 'done' || k.status === 'error';
    const off = subscribe(k.id, (e) => {
      if (RELAY.has(e.type)) push(r, { type: 'child', child: k.id, ev: { type: e.type, stage: e.stage, canary: e.canary, blocked: e.blocked, verdict: e.verdict, to: e.to, message: e.message } });
      if (e.type === 'done' || e.type === 'error') { off(); done(); }
    });
    if (finished()) { off(); done(); }
  })));

  r.status = 'judging';
  push(r, { type: 'stage', stage: 'verdict' });
  const children: ChildSummary[] = kids.map((k) => ({
    id: k.id, kind: k.kind === 'link' ? 'link' : 'file', name: k.name, level: k.verdict?.level ?? null,
    reason: k.verdict?.reasons[0] ?? k.error ?? '', summary: k.verdict?.summary ?? '',
  }));
  const ef: EmailFacts = {
    subject: String(report.subject ?? ''), from: String(report.from ?? ''), fromName: String(report.fromName ?? ''),
    replyTo: (report.replyTo as string[] | undefined) ?? [], auth: (report.auth as Record<string, string | null> | undefined) ?? {},
    forwardedBy: (report.forwardedBy as string | null | undefined) ?? null, findings, children,
    linksTotal: Number(report.linksTotal ?? links.length), attachmentsTotal: Number(report.attachmentsTotal ?? atts.length),
  };
  r.email = ef;
  const verdict = await writeEmailVerdict(ef, (m) => push(r, { type: 'note', message: m }));
  r.verdict = verdict;
  const box = r.box;
  r.receipt = signReceipt({
    product: 'Burn Box',
    run: r.id,
    what: r.name,
    kind: 'email',
    sha256: r.sha256,
    container: box?.container ?? '',
    limits: box?.limits ?? {},
    boxes: kids.map((k) => ({ run: k.id, what: k.name, container: k.box?.container ?? '', destroyedAt: k.box?.destroyedAt ?? '', destroyed: k.box?.destroyed ?? false, verdict: k.verdict?.level ?? 'error', signature: k.receipt?.signature ?? '' })),
    boxesBurned: 1 + kids.filter((k) => k.box?.destroyed).length,
    verdict: verdict.level,
    verdictBy: verdictBy(verdict),
    startedAt: box?.startedAt ?? r.createdAt,
    destroyedAt: [box?.destroyedAt ?? '', ...kids.map((k) => k.box?.destroyedAt ?? '')].sort().pop() ?? '',
    destroyed: Boolean(box?.destroyed) && kids.every((k) => k.box?.destroyed),
  });
  r.status = 'done';
  push(r, { type: 'done', verdict: verdict.level });
  save(r);
}

export function samplesList(): { id: string; name: string; kind: Kind; blurb: string; available: boolean }[] {
  const has = (f: string): boolean => existsSync(join(config.samplesDir, f));
  return [
    { id: 'email', name: 'invoice_overdue.eml', kind: 'email', blurb: 'The whole "invoice overdue" email: sender, link and attachment', available: has('invoice_overdue.eml') },
    { id: 'invoice', name: 'invoice_sample.py', kind: 'file', blurb: 'An "invoice helper" from an overdue invoice email', available: has('invoice_sample.py') },
    { id: 'phish', name: 'invoices-portal.lab.test/view', kind: 'link', blurb: 'A login page asking you to sign in to see an invoice', available: true },
    { id: 'benign', name: 'benign_sample.py', kind: 'file', blurb: 'A harmless script that writes one note', available: has('benign_sample.py') },
  ];
}

export function sampleInput(id: string): { kind: Kind; name: string; input: Buffer } | undefined {
  if (id === 'invoice' || id === 'benign') {
    const name = `${id}_sample.py`;
    return { kind: 'file', name, input: readFileSync(join(config.samplesDir, name)) };
  }
  if (id === 'email') return { kind: 'email', name: 'invoice_overdue.eml', input: readFileSync(join(config.samplesDir, 'invoice_overdue.eml')) };
  if (id === 'phish') return { kind: 'link', name: 'invoices-portal.lab.test/view', input: Buffer.from('http://invoices-portal.lab.test/view?inv=88213') };
  return undefined;
}

/** Is this upload an email? A saved .eml, or raw text that starts with mail headers. */
export function looksLikeEmail(name: string, body: Buffer): boolean {
  if (/\.(eml|msg)$/i.test(name)) return true;
  const head = body.subarray(0, 4096).toString('latin1');
  return /^(Return-Path|Received|From|Delivered-To|MIME-Version|Message-ID|X-[\w-]+):/im.test(head) && /^Subject:/im.test(head) && /^From:/im.test(head);
}
