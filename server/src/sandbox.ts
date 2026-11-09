// Starts one throwaway detonation box per run, streams its events, then destroys it and proves it is gone.
import { spawn, execFile } from 'node:child_process';
import { randomBytes, randomInt } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from './config.ts';

export type BoxEvent = { type: string; [k: string]: unknown };
export type Canaries = { aws_key_id: string; aws_secret: string; wallet_seed: string; password: string };
export type BoxResult = {
  container: string;
  name: string;
  limits: Record<string, string | number>;
  startedAt: string;
  destroyedAt: string;
  destroyed: boolean;
  report: Record<string, unknown> | null;
  hostTimedOut: boolean;
  error?: string;
};

const MARKER = '===BURNBOX-REPORT===';
const WORDS = ['amber', 'basin', 'cedar', 'delta', 'ember', 'fjord', 'grove', 'harbor', 'island', 'juniper', 'kelp', 'lumen', 'meadow', 'nectar', 'orbit', 'pepper', 'quartz', 'river', 'saffron', 'timber', 'umber', 'velvet', 'willow', 'zephyr'];
const alnum = (n: number, upper = false): string => {
  const a = upper ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567' : 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(n), (b) => a[b % a.length]).join('');
};

/** Fresh fake secrets for every run, so a reach for one can be traced to this run alone. */
export function makeCanaries(): Canaries {
  return {
    aws_key_id: `AKIA${alnum(16, true)}`,
    aws_secret: alnum(40),
    wallet_seed: Array.from({ length: 12 }, () => WORDS[randomInt(WORDS.length)]).join(' '),
    password: `${alnum(6)}-${alnum(6)}`,
  };
}

function docker(args: string[], timeoutMs = 20000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((done) => {
    execFile('docker', args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (e, out, err) => {
      const code = e ? (typeof (e as { code?: unknown }).code === 'number' ? Number((e as { code: number }).code) : 1) : 0;
      done({ code, out: String(out), err: String(err) });
    });
  });
}

export function limitsFor(kind: 'file' | 'link' | 'email'): Record<string, string | number> {
  const l = config.limits;
  return {
    network: kind === 'link' ? `${config.labNetwork} (internal, no internet)` : 'none',
    root: 'read-only',
    user: '1000 (not root)',
    capabilities: 'none',
    memory: kind === 'link' ? '768m' : l.memory,
    cpus: kind === 'link' ? '1' : l.cpus,
    processes: kind === 'link' ? 256 : l.pids,
    seconds: kind === 'link' ? Math.max(l.seconds, 30) : l.seconds,
    runtime: config.runtime || 'runc',
  };
}

// An email is opened in the same sealed file box (no network): reading it is the risky part.
type Spec = { kind: 'file' | 'link' | 'email'; name: string; input: Buffer; env: Record<string, string> };

export async function detonate(spec: Spec, onEvent: (e: BoxEvent) => void): Promise<BoxResult> {
  const name = `bbx-${alnum(10).toLowerCase()}`;
  const limits = limitsFor(spec.kind);
  const tmp = mkdtempSync(join(tmpdir(), 'bbx-'));
  const cidfile = join(tmp, 'cid');
  const args = ['run', '-i', '--name', name, '--cidfile', cidfile, '--label', 'burnbox=1',
    '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '1000:1000',
    '--tmpfs', '/work:rw,exec,nosuid,nodev,size=64m,mode=1777',
    '--tmpfs', `/home/sandbox:rw,nosuid,nodev,size=${spec.kind === 'link' ? '96m' : '8m'},mode=1777`,
    '--tmpfs', `/tmp:rw,nosuid,nodev,size=${spec.kind === 'link' ? '160m' : '64m'},mode=1777`,
    '--pids-limit', String(limits.processes), '--memory', String(limits.memory), '--memory-swap', String(limits.memory),
    '--cpus', String(limits.cpus), '--ulimit', 'nofile=512:512', '--ulimit', 'fsize=33554432:33554432',
    '--log-driver', 'none'];
  if (spec.kind !== 'link') args.push('--network', 'none', '--dns', '192.0.2.53');
  else args.push('--network', config.labNetwork, '--shm-size', '128m');
  if (config.runtime) args.push('--runtime', config.runtime);
  for (const [k, v] of Object.entries(spec.env)) args.push('-e', `${k}=${v}`);
  args.push('-e', `BB_TIMEOUT=${String(limits.seconds)}`);
  args.push(spec.kind === 'link' ? config.browserImage : config.boxImage);

  const startedAt = new Date().toISOString();
  let container = '';
  let report: Record<string, unknown> | null = null;
  let hostTimedOut = false;
  let error: string | undefined;

  await new Promise<void>((done) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    let afterMarker = false;
    let errText = '';
    let sealed = false;
    const seal = (): void => {
      if (sealed) return;
      try { container = readFileSync(cidfile, 'utf8').trim(); } catch { return; }
      if (!container) return;
      sealed = true;
      onEvent({ type: 'stage', stage: 'sealed', container: container.slice(0, 12), limits });
    };
    const poll = setInterval(seal, 50);
    const killer = setTimeout(() => {
      hostTimedOut = true;
      void docker(['kill', name]);
    }, config.limits.hostSeconds * 1000);
    child.stdout.on('data', (d: Buffer) => {
      seal();
      buf += d.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (afterMarker && line.trim()) {
          try { report = JSON.parse(line) as Record<string, unknown>; } catch { error = 'The box returned a report that could not be read.'; }
          afterMarker = false;
        } else if (line === MARKER) afterMarker = true;
        else if (line.startsWith('BB-EVENT ')) {
          try { onEvent(JSON.parse(line.slice(9)) as BoxEvent); } catch { /* ignore a torn line */ }
        }
      }
    });
    child.stderr.on('data', (d: Buffer) => { errText += d.toString('utf8'); if (errText.length > 8000) errText = errText.slice(-8000); });
    child.on('error', (e) => { error = `Could not start the box: ${e.message}`; });
    child.on('close', (code) => {
      clearInterval(poll);
      clearTimeout(killer);
      seal();
      if (!report && !error) error = hostTimedOut ? 'The box hit its time limit and was stopped.' : `The box exited without a report (code ${String(code)}). ${errText.trim().slice(-400)}`;
      done();
    });
    child.stdin.on('error', () => { /* the box may close stdin early */ });
    child.stdin.end(spec.input);
  });

  // Burn: remove the container, then prove it no longer exists.
  onEvent({ type: 'stage', stage: 'burning' });
  await docker(['rm', '-f', '-v', name]);
  const check = await docker(['inspect', name]);
  const destroyed = check.code !== 0;
  const destroyedAt = new Date().toISOString();
  rmSync(tmp, { recursive: true, force: true });
  onEvent({ type: 'stage', stage: 'burned', container: container.slice(0, 12), destroyed, destroyedAt });
  return { container, name, limits, startedAt, destroyedAt, destroyed, report, hostTimedOut, error };
}

/** Is Docker reachable, and are the box images present? Used by the health check. */
export async function sandboxStatus(): Promise<{ docker: boolean; box: boolean; browser: boolean; runtime: string }> {
  const v = await docker(['version', '--format', '{{.Server.Version}}'], 5000);
  if (v.code !== 0) return { docker: false, box: false, browser: false, runtime: config.runtime || 'runc' };
  const b = await docker(['image', 'inspect', config.boxImage], 5000);
  const w = await docker(['image', 'inspect', config.browserImage], 5000);
  return { docker: true, box: b.code === 0, browser: w.code === 0, runtime: config.runtime || 'runc' };
}

/** Leftover boxes from a crash are burned at start-up. */
export async function sweep(): Promise<number> {
  const l = await docker(['ps', '-aq', '--filter', 'label=burnbox=1'], 10000);
  const ids = l.out.split(/\s+/).filter(Boolean);
  if (ids.length) await docker(['rm', '-f', '-v', ...ids], 30000);
  return ids.length;
}
