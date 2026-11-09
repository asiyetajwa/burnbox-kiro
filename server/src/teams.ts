// Teams: a shared view over a set of runs. A team is a name and a secret code. No accounts, no passwords.
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.ts';

export type Team = { id: string; name: string; code: string; createdAt: string };

const teams = new Map<string, Team>();

const file = (): string => join(config.dataDir, 'teams.json');

export function loadTeams(): void {
  teams.clear();
  try {
    const list = JSON.parse(readFileSync(file(), 'utf8')) as Team[];
    for (const t of list) if (t && typeof t.id === 'string' && typeof t.code === 'string') teams.set(t.id, t);
  } catch { /* no file yet, or a damaged one: start with no teams */ }
}

function save(): void {
  mkdirSync(config.dataDir, { recursive: true });
  const tmp = `${file()}.tmp`;
  writeFileSync(tmp, JSON.stringify([...teams.values()], null, 2));
  renameSync(tmp, file());
}

/** A trimmed name of 1 to 60 characters, or undefined. */
export function cleanName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().replace(/\s+/g, ' ');
  return s.length >= 1 && s.length <= 60 ? s : undefined;
}

export function createTeam(name: string): Team {
  const t: Team = { id: `team-${randomUUID().slice(0, 8)}`, name, code: randomBytes(24).toString('base64url'), createdAt: new Date().toISOString() };
  teams.set(t.id, t);
  save();
  return t;
}

export function teamByCode(code: unknown): Team | undefined {
  if (typeof code !== 'string' || code.length < 16 || code.length > 128) return undefined;
  const given = Buffer.from(code);
  let found: Team | undefined;
  for (const t of teams.values()) {
    const want = Buffer.from(t.code);
    if (want.length === given.length && timingSafeEqual(want, given)) found = t;
  }
  return found;
}

/** What a joined member sees. The code is never sent back after creation. */
export function publicTeam(t: Team): { id: string; name: string; createdAt: string } {
  return { id: t.id, name: t.name, createdAt: t.createdAt };
}
