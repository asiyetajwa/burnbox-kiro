// Destruction receipts, signed with an Ed25519 key that lives only on this host.
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.ts';

let priv: KeyObject;
let pub: KeyObject;

export function loadKeys(): void {
  const dir = join(config.dataDir, 'keys');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, 'receipt-ed25519.pem');
  if (!existsSync(file)) {
    const { privateKey } = generateKeyPairSync('ed25519');
    writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  }
  priv = createPrivateKey(readFileSync(file));
  pub = createPublicKey(priv);
}

export function publicKeyPem(): string {
  return String(pub.export({ type: 'spki', format: 'pem' }));
}

/** Stable JSON: keys sorted at every level, so the same receipt always signs the same bytes. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    // Undefined members are skipped, like JSON.stringify does, so a receipt survives being saved as JSON.
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** The form used before the fix: an undefined member was written as the text `undefined`. Verify-only. */
function legacyCanonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(legacyCanonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${legacyCanonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

export type Receipt = { body: Record<string, unknown>; signature: string; algorithm: 'ed25519' };

export function signReceipt(body: Record<string, unknown>): Receipt {
  return { body, signature: sign(null, Buffer.from(canonical(body)), priv).toString('base64'), algorithm: 'ed25519' };
}

export function verifyReceipt(r: Receipt): boolean {
  try {
    const sig = Buffer.from(r.signature, 'base64');
    if (verify(null, Buffer.from(canonical(r.body)), pub, sig)) return true;
    // Older file and link receipts were signed with `parent: undefined`, which a saved copy no longer has.
    if (!('parent' in r.body)) return verify(null, Buffer.from(legacyCanonical({ ...r.body, parent: undefined })), pub, sig);
    return false;
  } catch {
    return false;
  }
}
