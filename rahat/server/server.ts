// Rahat sync server. Zero dependencies: Node 24 runs this TypeScript directly.
//
// Public (no account; a camp proves ownership with the secret key its phone made):
//   POST /api/public/events   { events, keys }   send camp reports, check-ins, receipts
//   POST /api/public/pull     { keys }           read back your own camps' status
// Staff (signed-in session cookie, permissions by role):
//   POST /api/auth/login | /api/auth/logout, GET /api/auth/me
//   GET  /api/events?since=N, POST /api/events
//   GET/POST /api/staff, POST /api/staff/:id     (control room only)
// SMS gateway (header x-gateway-token = SMS_GATEWAY_TOKEN):
//   POST /api/sms   { text } or form text=...
// Everything else serves the built app from ../dist.

import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Ev, StaffRole } from '../src/lib/types.ts';
import { decode } from '../src/lib/codec.ts';
import { TEAMS, TRUCKS } from '../src/lib/config.ts';
import { invalid } from './validate.ts';
import type { User } from './auth.ts';
import {
  DATA_DIR,
  SESSION_HOURS,
  STAFF_ROLES,
  checkPassword,
  hashPassword,
  issueToken,
  loadUsers,
  passwordProblem,
  publicUser,
  saveUsers,
  tooManyAttempts,
  userFromToken,
} from './auth.ts';

const PORT = Number(process.env.PORT ?? 4124);
const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const EVENTS_FILE = join(DATA_DIR, 'events.json');
const CAMPS_FILE = join(DATA_DIR, 'camps.json');
const MAX_BODY = 1_000_000;
const COOKIE = 'rahat_session';

// ---------------------------------------------------------------- storage

type Box = { epoch: string; events: Ev[] };

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(file: string, data: unknown) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
}

const box: Box = readJson(EVENTS_FILE, { epoch: randomUUID(), events: [] });
if (!box.events.length && process.env.SEED_DEV_DATA === '1') {
  const { seedEvents } = await import('../src/lib/seed.ts');
  box.events = await seedEvents();
  console.log(`Seeded ${box.events.length} development events.`);
}
const ids = new Set(box.events.map((e) => e.id));
const dispatchCamp = new Map<string, string>(); // dispatchId -> campId
const taskCamp = new Map<string, string>(); // taskId -> campId
function index(e: Ev) {
  if (e.type === 'dispatch.approve') dispatchCamp.set(e.dispatchId, e.campId);
  if (e.type === 'team.task') taskCamp.set(e.taskId, e.campId);
}
box.events.forEach(index);
writeJson(EVENTS_FILE, box);

/** campId -> sha256 of the key held by the camp's phone */
const campKeys: Record<string, string> = readJson(CAMPS_FILE, {});
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function ingest(events: Ev[]): string[] {
  const added: string[] = [];
  for (const e of events) {
    if (ids.has(e.id)) continue;
    box.events.push(e);
    ids.add(e.id);
    index(e);
    added.push(e.id);
  }
  if (added.length) writeJson(EVENTS_FILE, box);
  return added;
}

let users = loadUsers();
let usersSeen = mtime(join(DATA_DIR, 'users.json'));
function mtime(f: string) {
  try {
    return statSync(f).mtimeMs;
  } catch {
    return 0;
  }
}
/** Pick up accounts made by `npm run create-admin` without a restart. */
function freshUsers(): User[] {
  const m = mtime(join(DATA_DIR, 'users.json'));
  if (m !== usersSeen) {
    users = loadUsers();
    usersSeen = m;
  }
  return users;
}

// ---------------------------------------------------------------- http helpers

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** JSON only: a cross-site form cannot send this content type, which (with SameSite cookies) blocks CSRF. */
async function json(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'Send JSON');
  try {
    const v = JSON.parse(await readBody(req));
    if (!v || typeof v !== 'object') throw new Error();
    return v;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, 'Invalid JSON');
  }
}

function cookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
}

const secure = (req: IncomingMessage) => req.headers['x-forwarded-proto'] === 'https' || 'encrypted' in req.socket;
const sessionCookie = (req: IncomingMessage, value: string, maxAge: number) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure(req) ? '; Secure' : ''}`;

function staff(req: IncomingMessage, roles?: StaffRole[]): User {
  const u = userFromToken(cookie(req, COOKIE), freshUsers());
  if (!u) throw new HttpError(401, 'Sign in required');
  if (roles && !roles.includes(u.role)) throw new HttpError(403, 'Not allowed for your role');
  return u;
}

const ip = (req: IncomingMessage) => (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() ?? req.socket.remoteAddress ?? '?';

// ---------------------------------------------------------------- permissions

const CAMP_TYPES = new Set<Ev['type']>(['camp.report', 'camp.checkin', 'dispatch.receive']);

const ALLOWED: Record<StaffRole, Ev['type'][]> = {
  control: ['dispatch.approve', 'team.task', 'camp.verify', 'camp.report', 'camp.checkin', 'dispatch.receive'],
  warehouse: ['stock.in', 'dispatch.pack'],
  driver: ['dispatch.load', 'dispatch.blocked', 'dispatch.deliver', 'camp.report', 'camp.checkin', 'dispatch.receive'],
  rescue: ['team.status', 'dispatch.load', 'dispatch.deliver', 'camp.checkin', 'camp.report', 'dispatch.receive'],
};

/** Why this staff member may not record this event, or null if they may. Also stamps who did it. */
function staffRule(u: User, e: Ev): string | null {
  if (!ALLOWED[u.role].includes(e.type)) return `${u.role} cannot record ${e.type}`;
  if (CAMP_TYPES.has(e.type)) {
    // Staff only pass camp messages on (typed from an SMS, or scanned from a camp's QR),
    // except a rescue team confirming it reached a camp.
    const onSite = u.role === 'rescue' && e.type === 'camp.checkin' && e.by === 'rescue';
    if (!onSite && (e.by !== 'camp' || (e.via !== 'sms' && e.via !== 'relay'))) return 'camp messages must be relayed';
  } else e.by = u.role;
  if ((e.type === 'dispatch.load' || e.type === 'dispatch.deliver') && u.role !== 'control' && e.carrier !== u.unit)
    return 'you can only act for your own truck or team';
  if (e.type === 'team.status' && e.teamId !== u.unit) return 'you can only update your own team';
  if (e.type === 'dispatch.receive' && dispatchCamp.get(e.dispatchId) !== e.campId) return 'dispatch is not for that camp';
  e.actor = u.id;
  return null;
}

/** Public phones may only write for camps whose key they hold. A first report registers the camp. */
function publicRule(e: Ev, keys: Record<string, string>): string | null {
  if (!CAMP_TYPES.has(e.type)) return 'not allowed';
  const campId = (e as { campId: string }).campId;
  const key = keys[campId];
  if (typeof key !== 'string' || key.length < 24) return 'missing camp key';
  const known = campKeys[campId];
  if (known) {
    if (known !== sha(key)) return 'wrong camp key';
  } else if (e.type !== 'camp.report') return 'unknown camp';
  if (e.type === 'dispatch.receive' && dispatchCamp.get(e.dispatchId) !== campId) return 'dispatch is not for that camp';
  e.by = 'camp';
  e.via = 'net';
  delete e.actor;
  return null;
}

/** Handover codes go to the camp and the control room only. Carriers check against the hash. */
function forRole(e: Ev, role: StaffRole | 'camp'): Ev {
  if (e.type === 'dispatch.approve' && role !== 'control' && role !== 'camp') {
    const copy = { ...e };
    delete copy.code;
    return copy;
  }
  return e;
}

function campEvents(campIds: Set<string>): Ev[] {
  return box.events.filter((e) => {
    switch (e.type) {
      case 'camp.report':
      case 'camp.checkin':
      case 'camp.verify':
      case 'dispatch.approve':
      case 'dispatch.receive':
      case 'team.task':
        return campIds.has(e.campId);
      case 'dispatch.pack':
      case 'dispatch.load':
      case 'dispatch.blocked':
      case 'dispatch.deliver':
        return campIds.has(dispatchCamp.get(e.dispatchId) ?? '');
      case 'team.status':
        return !!e.taskId && campIds.has(taskCamp.get(e.taskId) ?? '');
      default:
        return false;
    }
  });
}

// ---------------------------------------------------------------- routes

async function api(req: IncomingMessage, res: ServerResponse, url: URL) {
  const path = url.pathname;
  const method = req.method ?? 'GET';

  if (path === '/api/health') return send(res, 200, { ok: true });

  // ---- public camp phones
  if (path === '/api/public/events' && method === 'POST') {
    const body = await json(req);
    const keys = (body.keys ?? {}) as Record<string, string>;
    const events = Array.isArray(body.events) ? body.events.slice(0, 200) : [];
    const ok: Ev[] = [];
    const rejected: { id: unknown; error: string }[] = [];
    for (const raw of events) {
      const bad = invalid(raw) ?? publicRule(raw as Ev, keys);
      if (bad) rejected.push({ id: (raw as Ev)?.id, error: bad });
      else {
        const e = raw as Ev;
        if (e.type === 'camp.report' && !campKeys[e.campId]) {
          campKeys[e.campId] = sha(keys[e.campId]);
          writeJson(CAMPS_FILE, campKeys);
        }
        ok.push(e);
      }
    }
    ingest(ok);
    return send(res, 200, { accepted: ok.map((e) => e.id), rejected });
  }

  if (path === '/api/public/pull' && method === 'POST') {
    const body = await json(req);
    const keys = (body.keys ?? {}) as Record<string, string>;
    const mine = new Set(Object.entries(keys).filter(([c, k]) => typeof k === 'string' && campKeys[c] === sha(k)).map(([c]) => c));
    return send(res, 200, { events: campEvents(mine).map((e) => forRole(e, 'camp')) });
  }

  // ---- staff sign-in
  if (path === '/api/auth/login' && method === 'POST') {
    if (tooManyAttempts(ip(req))) throw new HttpError(429, 'Too many attempts. Wait 15 minutes.');
    const { username, password } = await json(req);
    const u = freshUsers().find((x) => x.username === String(username ?? '').trim().toLowerCase());
    if (!u || !u.active || typeof password !== 'string' || !checkPassword(u, password))
      throw new HttpError(401, 'Wrong username or password.');
    return send(res, 200, { user: publicUser(u) }, { 'set-cookie': sessionCookie(req, issueToken(u), SESSION_HOURS * 3600) });
  }
  if (path === '/api/auth/logout' && method === 'POST') return send(res, 200, { ok: true }, { 'set-cookie': sessionCookie(req, '', 0) });
  if (path === '/api/auth/me') return send(res, 200, { user: publicUser(staff(req)) });

  // ---- staff data
  if (path === '/api/events' && method === 'GET') {
    const u = staff(req);
    const since = Math.max(0, Number(url.searchParams.get('since') ?? 0) || 0);
    return send(res, 200, { events: box.events.slice(since).map((e) => forRole(e, u.role)), cursor: box.events.length, epoch: box.epoch });
  }
  if (path === '/api/events' && method === 'POST') {
    const u = staff(req);
    const body = await json(req);
    const events = Array.isArray(body.events) ? body.events.slice(0, 500) : [];
    const ok: Ev[] = [];
    const rejected: { id: unknown; error: string }[] = [];
    for (const raw of events) {
      const bad = invalid(raw) ?? staffRule(u, raw as Ev);
      if (bad) rejected.push({ id: (raw as Ev)?.id, error: bad });
      else ok.push(raw as Ev);
    }
    ingest(ok);
    return send(res, 200, { accepted: ok.map((e) => e.id), rejected });
  }

  // ---- staff accounts (control room admins)
  if (path === '/api/staff' && method === 'GET') {
    staff(req, ['control']);
    return send(res, 200, { users: users.map(publicUser) });
  }
  if (path === '/api/staff' && method === 'POST') {
    staff(req, ['control']);
    const b = await json(req);
    const username = String(b.username ?? '').trim().toLowerCase();
    const name = String(b.name ?? '').trim();
    const role = b.role as StaffRole;
    const unit = b.unit ? String(b.unit) : undefined;
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new HttpError(400, 'Username: 3-32 letters, numbers, dot, dash.');
    if (users.some((x) => x.username === username)) throw new HttpError(409, 'That username is taken.');
    if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Enter their full name.');
    if (!STAFF_ROLES.includes(role)) throw new HttpError(400, 'Pick a role.');
    if (role === 'driver' && !TRUCKS.some((t) => t.id === unit)) throw new HttpError(400, 'Pick the truck this driver uses.');
    if (role === 'rescue' && !TEAMS.some((t) => t.id === unit)) throw new HttpError(400, 'Pick the team.');
    const problem = passwordProblem(b.password);
    if (problem) throw new HttpError(400, problem);
    const u: User = {
      id: randomUUID(),
      username,
      name,
      role,
      unit: role === 'driver' || role === 'rescue' ? unit : undefined,
      ...hashPassword(b.password as string),
      active: true,
      v: 1,
      createdAt: Date.now(),
    };
    users = [...users, u];
    saveUsers(users);
    usersSeen = mtime(join(DATA_DIR, 'users.json'));
    return send(res, 201, { user: publicUser(u) });
  }
  const m = path.match(/^\/api\/staff\/([0-9a-f-]{36})$/);
  if (m && method === 'POST') {
    const me = staff(req, ['control']);
    const b = await json(req);
    const u = users.find((x) => x.id === m[1]);
    if (!u) throw new HttpError(404, 'No such account.');
    if (typeof b.active === 'boolean') {
      if (u.id === me.id && !b.active) throw new HttpError(400, 'You cannot deactivate yourself.');
      u.active = b.active;
      u.v += 1;
    }
    if (b.password !== undefined) {
      const problem = passwordProblem(b.password);
      if (problem) throw new HttpError(400, problem);
      Object.assign(u, hashPassword(b.password as string));
      u.v += 1;
    }
    saveUsers(users);
    usersSeen = mtime(join(DATA_DIR, 'users.json'));
    return send(res, 200, { user: publicUser(u) });
  }

  // ---- SMS gateway webhook
  if (path === '/api/sms' && method === 'POST') {
    const want = process.env.SMS_GATEWAY_TOKEN;
    const got = String(req.headers['x-gateway-token'] ?? '');
    if (!want || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want)))
      throw new HttpError(401, 'Gateway token required');
    const raw = await readBody(req);
    let text = '';
    try {
      const j = JSON.parse(raw);
      text = String(j.text ?? j.message ?? j.body ?? '');
    } catch {
      text = new URLSearchParams(raw).get('text') ?? raw;
    }
    const r = decode(text, 'sms');
    if (!r.ok) return send(res, 422, { ok: false, error: r.error });
    const bad = invalid(r.ev);
    if (bad) return send(res, 422, { ok: false, error: bad });
    const added = ingest([r.ev]);
    return send(res, 200, { ok: true, duplicate: added.length === 0, id: r.ev.id });
  }

  throw new HttpError(404, 'Not found');
}

// ---------------------------------------------------------------- static app

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'permissions-policy': 'camera=(self), geolocation=(self), microphone=()',
  'content-security-policy':
    "default-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; style-src 'self' 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'",
};

function serveStatic(path: string, res: ServerResponse) {
  if (!existsSync(DIST)) return send(res, 404, { error: 'Run "npm run build" first.' });
  let file = normalize(join(DIST, decodeURIComponent(path)));
  if (!file.startsWith(DIST + sep) && file !== DIST) return send(res, 400, { error: 'Bad path' });
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  const immutable = file.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...SECURITY_HEADERS,
  });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(url.pathname, res);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    send(res, status, { error: err instanceof HttpError ? err.message : 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Rahat server on http://localhost:${PORT} (${box.events.length} events, ${users.length} staff accounts)`);
  if (!freshUsers().length) console.log('No staff accounts yet. Create the first admin with: npm run create-admin');
  if (!process.env.SMS_GATEWAY_TOKEN) console.log('SMS gateway disabled: set SMS_GATEWAY_TOKEN to enable /api/sms.');
});
