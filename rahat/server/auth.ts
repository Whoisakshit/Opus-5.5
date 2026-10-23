// Staff accounts and sessions. No public sign-up: the first control room admin
// is created with `npm run create-admin`, and admins create everyone else.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StaffRole } from '../src/lib/types.ts';

export const DATA_DIR = process.env.RAHAT_DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'data');
const USERS = join(DATA_DIR, 'users.json');
const SECRET_FILE = join(DATA_DIR, 'session.key');
export const SESSION_HOURS = 12; // one shift

export type User = {
  id: string;
  username: string;
  name: string;
  role: StaffRole;
  unit?: string; // truck id for drivers, team id for rescue
  salt: string;
  hash: string;
  active: boolean;
  v: number; // bumped on password reset or deactivation; old sessions stop working
  createdAt: number;
};
export type PublicUser = Pick<User, 'id' | 'username' | 'name' | 'role' | 'unit' | 'active'>;

export const STAFF_ROLES: StaffRole[] = ['control', 'warehouse', 'driver', 'rescue'];

function secret(): Buffer {
  if (process.env.SESSION_SECRET) return Buffer.from(process.env.SESSION_SECRET);
  if (!existsSync(SECRET_FILE)) {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(SECRET_FILE, randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return Buffer.from(readFileSync(SECRET_FILE, 'utf8'));
}
const KEY = secret();

export function loadUsers(): User[] {
  try {
    return JSON.parse(readFileSync(USERS, 'utf8'));
  } catch {
    return [];
  }
}
export function saveUsers(users: User[]) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(USERS, JSON.stringify(users, null, 2), { mode: 0o600 });
}

export const publicUser = ({ id, username, name, role, unit, active }: User): PublicUser => ({ id, username, name, role, unit, active });

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}

export function checkPassword(u: User, password: string): boolean {
  const got = scryptSync(password, u.salt, 64);
  const want = Buffer.from(u.hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

export function passwordProblem(p: unknown): string | null {
  if (typeof p !== 'string' || p.length < 10) return 'Password must be at least 10 characters.';
  if (p.length > 200) return 'Password is too long.';
  return null;
}

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sign = (body: string) => createHmac('sha256', KEY).update(body).digest('base64url');

export function issueToken(u: User): string {
  const body = b64(JSON.stringify({ uid: u.id, v: u.v, exp: Date.now() + SESSION_HOURS * 3_600_000 }));
  return `${body}.${sign(body)}`;
}

/** Returns the user only if the token is genuine, unexpired, and the account is still active and unchanged. */
export function userFromToken(token: string | undefined, users: User[]): User | null {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const { uid, v, exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof exp !== 'number' || exp < Date.now()) return null;
    const u = users.find((x) => x.id === uid);
    return u && u.active && u.v === v ? u : null;
  } catch {
    return null;
  }
}

/** Simple sliding-window limit for sign-in attempts per IP. */
const attempts = new Map<string, number[]>();
export function tooManyAttempts(key: string, limit = 10, windowMs = 15 * 60_000): boolean {
  const now = Date.now();
  const list = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  attempts.set(key, list);
  return list.length > limit;
}
