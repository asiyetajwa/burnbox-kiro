// Forward It To Burn Box: a small inbound mail receiver. A suspicious email forwarded to check@MAIL_DOMAIN
// becomes an email run, so nobody has to open the email, click its link or save its attachment.
// Point the domain's MX record at the Vultr VM and map port 25 to MAIL_PORT. Inbound only: nothing is sent.
import { createServer, type Socket } from 'node:net';
import { createRun } from './runs.ts';

const DOMAIN = (process.env.MAIL_DOMAIN ?? '').toLowerCase();
const PORT = Number(process.env.MAIL_PORT ?? 2525);
const MAX = 25 * 1024 * 1024;
const PER_HOUR = Number(process.env.MAIL_PER_HOUR ?? 20);
const seen = new Map<string, number[]>();

export function mailAddress(): string | null {
  return DOMAIN ? `check@${DOMAIN}` : null;
}

function allowed(ip: string): boolean {
  const now = Date.now();
  const list = (seen.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (list.length >= PER_HOUR) return false;
  list.push(now);
  seen.set(ip, list);
  return true;
}

function subjectOf(raw: Buffer): string {
  const m = /^Subject:\s*(.+)$/im.exec(raw.subarray(0, 16384).toString('utf8'));
  return (m?.[1] ?? 'forwarded email').trim().slice(0, 100);
}

function session(sock: Socket): void {
  const say = (line: string): void => { sock.write(`${line}\r\n`); };
  let buf = Buffer.alloc(0);
  let inData = false;
  let rcpt = false;
  let data: Buffer[] = [];
  let size = 0;
  sock.setTimeout(60_000, () => sock.destroy());
  say(`220 ${DOMAIN || 'burnbox'} Burn Box mail intake`);

  sock.on('data', (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (inData) {
        const end = buf.indexOf('\r\n.\r\n');
        if (end < 0) {
          size += buf.length;
          if (size > MAX) { say('552 Message too large'); sock.destroy(); return; }
          data.push(buf.subarray(0, Math.max(0, buf.length - 4)));
          buf = buf.subarray(Math.max(0, buf.length - 4));
          return;
        }
        data.push(buf.subarray(0, end));
        buf = buf.subarray(end + 5);
        inData = false;
        const raw = Buffer.from(Buffer.concat(data).toString('latin1').replace(/^\.\./gm, '.'), 'latin1');
        data = []; size = 0;
        if (!allowed(String(sock.remoteAddress))) { say('451 Too many emails from this address this hour'); continue; }
        const run = createRun('email', `Forwarded: ${subjectOf(raw)}`, raw, { via: 'email' });
        say(`250 Queued as ${run.id}`);
        continue;
      }
      const nl = buf.indexOf('\r\n');
      if (nl < 0) { if (buf.length > 4096) sock.destroy(); return; }
      const line = buf.subarray(0, nl).toString('latin1');
      buf = buf.subarray(nl + 2);
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO') { sock.write(`250-${DOMAIN || 'burnbox'}\r\n250-SIZE ${String(MAX)}\r\n250 8BITMIME\r\n`); }
      else if (cmd === 'HELO') say(`250 ${DOMAIN || 'burnbox'}`);
      else if (cmd === 'MAIL') { rcpt = false; say('250 OK'); }
      else if (cmd === 'RCPT') {
        const to = (/<([^>]+)>/.exec(line)?.[1] ?? '').toLowerCase();
        if (DOMAIN && to.endsWith(`@${DOMAIN}`)) { rcpt = true; say('250 OK'); } else say('550 No such mailbox here');
      }
      else if (cmd === 'DATA') { if (!rcpt) say('503 Need a recipient first'); else { inData = true; say('354 Send the email; end with a line holding only a dot'); } }
      else if (cmd === 'RSET') { rcpt = false; say('250 OK'); }
      else if (cmd === 'NOOP') say('250 OK');
      else if (cmd === 'QUIT') { say('221 Bye'); sock.end(); return; }
      else say('502 Not supported');
    }
  });
  sock.on('error', () => { /* a dropped connection ends the session */ });
}

export function startMail(): void {
  if (!DOMAIN) return;
  createServer(session).listen(PORT, '0.0.0.0', () => { console.log(`Burn Box mail intake on port ${String(PORT)} for ${mailAddress() ?? ''}`); });
}
